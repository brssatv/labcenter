const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { spawn, spawnSync } = require("child_process");
const { pathToFileURL } = require("url");

const express = require("express");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { createPortalStore } = require("./lib/portal-store");
const { createS3Storage, sanitizeS3PathSegment } = require("./lib/s3-storage");
const { extractRequisitionScanData } = require("./lib/requisition-scan");
require("dotenv").config();

const app = express();
const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-only-change-me";
const apiBodyLimit = "16mb";
const sourceDataDir = path.join(__dirname, "data");
const defaultDataDir = sourceDataDir;
const resolveRuntimePath = (value, fallback) => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return path.isAbsolute(raw) ? raw : path.join(__dirname, raw);
};
const normalizeUrlEnv = (value) => String(value || "").trim().replace(/\/+$/, "");
const dataDir = resolveRuntimePath(process.env.DATA_DIR, defaultDataDir);
const sessionDir = resolveRuntimePath(process.env.SESSION_DIR, path.join(dataDir, "sessions"));
const usersPath = path.join(dataDir, "users.json");
const facilityPath = path.join(dataDir, "facility.json");
const auditPath = path.join(dataDir, "audit.log");
const zipCodesPath = path.join(sourceDataDir, "us-zips.json");
const reportPdfRendererPath = path.join(__dirname, "scripts", "render-html-to-pdf.swift");
const requisitionScanOcrPath = path.join(__dirname, "scripts", "ocr-helper.js");
const orderIdPadLength = 5;
const orderIdStartNumber = 1;
const APP_BASE_URL = normalizeUrlEnv(process.env.APP_BASE_URL);
const OIDC_ISSUER = normalizeUrlEnv(process.env.OIDC_ISSUER);
const OIDC_CLIENT_ID = String(process.env.OIDC_CLIENT_ID || "").trim();
const OIDC_CLIENT_SECRET = String(process.env.OIDC_CLIENT_SECRET || "").trim();
const OIDC_SCOPE = String(process.env.OIDC_SCOPE || "openid profile email").trim() || "openid profile email";
const OIDC_REDIRECT_URI = String(process.env.OIDC_REDIRECT_URI || "").trim();
const OIDC_POST_LOGOUT_REDIRECT_URI = String(process.env.OIDC_POST_LOGOUT_REDIRECT_URI || "").trim();
const OIDC_REQUIRED_ROLE = String(process.env.OIDC_REQUIRED_ROLE || "").trim();
const OIDC_ENABLED = Boolean(OIDC_ISSUER && OIDC_CLIENT_ID);
const OIDC_AUTH_TIMEOUT_MS = 10 * 60 * 1000;
const OIDC_CLOCK_TOLERANCE_SEC = 60;
const normalizePublishMode = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "disabled") return "disabled";
  if (raw === "log" || raw === "logged") return "log";
  if (raw === "simulate" || raw === "simulated" || raw === "mock") return "simulated";
  return "disabled";
};
const reportPdfEnabled = String(process.env.LABCENTER_ENABLE_REPORT_PDF || "").trim()
  ? /^(1|true|yes|on)$/i.test(String(process.env.LABCENTER_ENABLE_REPORT_PDF || "").trim())
  : process.platform === "darwin";
const scanOcrEnabled = String(process.env.LABCENTER_ENABLE_SCAN_OCR || "").trim()
  ? /^(1|true|yes|on)$/i.test(String(process.env.LABCENTER_ENABLE_SCAN_OCR || "").trim())
  : true;
const publishEmailMode = normalizePublishMode(process.env.LABCENTER_PUBLISH_EMAIL_MODE || "disabled");
const publishFaxMode = normalizePublishMode(process.env.LABCENTER_PUBLISH_FAX_MODE || "disabled");
const PHARMD_SFTP_HOST = String(process.env.PHARMD_SFTP_HOST || "18.144.129.54").trim();
const PHARMD_SFTP_PORT = Math.max(1, Math.floor(Number(process.env.PHARMD_SFTP_PORT || 22) || 22));
const PHARMD_SFTP_USERNAME = String(process.env.PHARMD_SFTP_USERNAME || "jays-user").trim();
const PHARMD_SFTP_PASSWORD = String(process.env.PHARMD_SFTP_PASSWORD || "").trim();
const PHARMD_SFTP_ORU_DIR = String(process.env.PHARMD_SFTP_ORU_DIR || "oru").trim() || "oru";
const PHARMD_SFTP_TIMEOUT_SEC = Math.max(5, Math.min(120, Math.floor(Number(process.env.PHARMD_SFTP_TIMEOUT_SEC || 30) || 30)));

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function seedFileIfMissing(targetPath, seedPath, fallbackContents) {
  if (fs.existsSync(targetPath)) return;
  ensureDir(path.dirname(targetPath));

  if (seedPath && fs.existsSync(seedPath) && path.resolve(seedPath) !== path.resolve(targetPath)) {
    fs.copyFileSync(seedPath, targetPath);
    return;
  }

  fs.writeFileSync(targetPath, fallbackContents, "utf8");
}

function loadUsersFromPath(targetPath) {
  try {
    const raw = fs.readFileSync(targetPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.users) ? parsed.users : [];
  } catch {
    return [];
  }
}

function saveUsersToPath(targetPath, users) {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, `${JSON.stringify({ users }, null, 2)}\n`, "utf8");
}

function getUserSyncKeys(user) {
  return Array.from(
    new Set(
      [user?.id, user?.username, user?.email]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function syncSeedUsers(runtimeUsersPath, sourceUsersSeedPath) {
  if (!sourceUsersSeedPath || path.resolve(runtimeUsersPath) === path.resolve(sourceUsersSeedPath)) {
    return;
  }

  const sourceUsers = loadUsersFromPath(sourceUsersSeedPath);
  if (!sourceUsers.length) return;

  const runtimeUsers = loadUsersFromPath(runtimeUsersPath);
  const runtimeIndexByKey = new Map();

  runtimeUsers.forEach((user, index) => {
    getUserSyncKeys(user).forEach((key) => {
      if (!runtimeIndexByKey.has(key)) {
        runtimeIndexByKey.set(key, index);
      }
    });
  });

  let changed = false;

  sourceUsers.forEach((sourceUser) => {
    const matchIndex = getUserSyncKeys(sourceUser)
      .map((key) => runtimeIndexByKey.get(key))
      .find((index) => Number.isInteger(index));
    const nextUser = { ...(matchIndex !== undefined ? runtimeUsers[matchIndex] : {}), ...sourceUser };

    if (matchIndex === undefined) {
      runtimeUsers.push(nextUser);
      changed = true;
      getUserSyncKeys(nextUser).forEach((key) => runtimeIndexByKey.set(key, runtimeUsers.length - 1));
      return;
    }

    if (JSON.stringify(runtimeUsers[matchIndex]) !== JSON.stringify(nextUser)) {
      runtimeUsers[matchIndex] = nextUser;
      changed = true;
    }

    getUserSyncKeys(nextUser).forEach((key) => runtimeIndexByKey.set(key, matchIndex));
  });

  if (changed) {
    saveUsersToPath(runtimeUsersPath, runtimeUsers);
  }
}

function ensureRuntimeData() {
  ensureDir(dataDir);
  ensureDir(sessionDir);
  seedFileIfMissing(
    usersPath,
    path.join(sourceDataDir, "users.json"),
    JSON.stringify(
      {
        users: [
          {
            id: "doctor-001",
            email: "admin@clinic.local",
            displayName: "Clinic Admin",
            role: "doctor",
            passwordHash:
              "scrypt$16384$8$1$149285dc2e3722f45b7bc645866caded$ec49b81e2a49b270fdbc4dfb26ddb4ec251ffce4b61b45b6a47d3648bbd7d7e2a19f5489de59ce2a52d2bd6e45465b1f02f2a1f274688b7051f708056648d65c",
          },
        ],
      },
      null,
      2
    ) + "\n"
  );
  syncSeedUsers(usersPath, path.join(sourceDataDir, "users.json"));
  seedFileIfMissing(
    facilityPath,
    path.join(sourceDataDir, "facility.json"),
    JSON.stringify(
      {
        importedAt: null,
        sourceFiles: {},
        accounts: [],
        providers: [],
      },
      null,
      2
    ) + "\n"
  );
  seedFileIfMissing(auditPath, "", "");
}

ensureRuntimeData();

const portalStore = createPortalStore({ dataDir });
const s3Storage = createS3Storage({
  bucket: process.env.LABCENTER_S3_BUCKET,
  region: process.env.LABCENTER_S3_REGION,
  endpoint: process.env.LABCENTER_S3_ENDPOINT,
  keyPrefix: process.env.LABCENTER_S3_PREFIX || "labcenter",
  forcePathStyle: /^(1|true|yes|on)$/i.test(String(process.env.LABCENTER_S3_FORCE_PATH_STYLE || "").trim()),
});
let oidcDiscoveryCache = null;
let oidcDiscoveryPromise = null;
let oidcJwksCache = null;
let oidcJwksPromise = null;

if (SESSION_SECRET === "dev-only-change-me") {
  console.warn("[security] SESSION_SECRET is using the default value. Set a strong value in production.");
}
if (isProd && SESSION_SECRET === "dev-only-change-me") {
  throw new Error("SESSION_SECRET must be set to a strong custom value in production.");
}
if ((OIDC_ISSUER && !OIDC_CLIENT_ID) || (!OIDC_ISSUER && OIDC_CLIENT_ID)) {
  console.warn("[auth] OIDC is partially configured. Set both OIDC_ISSUER and OIDC_CLIENT_ID to enable admin SSO.");
}
if (!reportPdfEnabled) {
  console.warn("[runtime] Report PDF rendering is disabled for this deployment.");
}
if (!scanOcrEnabled) {
  console.warn("[runtime] Requisition scan OCR is disabled for this deployment.");
}
if (!s3Storage.enabled) {
  console.warn("[runtime] S3 file storage is disabled. Raw uploads and generated PDFs will not be persisted externally.");
}

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: "no-referrer" },
  })
);

app.use(express.json({ limit: apiBodyLimit }));
app.use(express.urlencoded({ extended: false, limit: apiBodyLimit }));

app.use(
  session({
    name: "labcenter.sid",
    secret: SESSION_SECRET,
    store: new FileStore({
      path: sessionDir,
      ttl: Math.ceil((15 * 60 * 1000) / 1000),
      reapInterval: 3600,
      retries: 0,
      logFn: () => {},
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // OIDC callback redirects need the session cookie on the top-level cross-site return from the IdP.
      sameSite: OIDC_ENABLED ? "lax" : "strict",
      secure: isProd,
      maxAge: 15 * 60 * 1000,
    },
  })
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});

const failedLoginAttempts = new Map();
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 30 * 60 * 1000;
const FAIL_LIMIT = 5;

function loadUsers() {
  return loadUsersFromPath(usersPath);
}

function loadFacilityData() {
  try {
    const raw = fs.readFileSync(facilityPath, "utf8");
    const parsed = JSON.parse(raw);
    const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
    const providers = Array.isArray(parsed.providers) ? parsed.providers : [];
    return {
      ...parsed,
      accounts,
      providers,
    };
  } catch {
    return {
      importedAt: null,
      sourceFiles: {},
      accounts: [],
      providers: [],
    };
  }
}

function saveFacilityData(payload) {
  fs.writeFileSync(facilityPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function safeEqHex(aHex, bHex) {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyPassword(password, encoded) {
  if (typeof encoded !== "string") return false;
  const [algo, n, r, p, salt, expectedHash] = encoded.split("$");
  if (algo !== "scrypt" || !n || !r || !p || !salt || !expectedHash) return false;

  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (!Number.isFinite(N) || !Number.isFinite(R) || !Number.isFinite(P)) return false;

  try {
    const derived = crypto
      .scryptSync(password, salt, expectedHash.length / 2, {
        N,
        r: R,
        p: P,
        maxmem: 128 * N * R + 1024 * 1024,
      })
      .toString("hex");

    return safeEqHex(derived, expectedHash);
  } catch {
    return false;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const N = 16384;
  const r = 8;
  const p = 1;
  const hash = crypto
    .scryptSync(password, salt, 64, {
      N,
      r,
      p,
      maxmem: 128 * N * r + 1024 * 1024,
    })
    .toString("hex");
  return ["scrypt", N, r, p, salt, hash].join("$");
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

function randomBase64Url(size = 32) {
  return crypto.randomBytes(size).toString("base64url");
}

function toCodeChallenge(codeVerifier) {
  return crypto.createHash("sha256").update(String(codeVerifier || "")).digest("base64url");
}

function getPublicBaseUrl(req) {
  if (APP_BASE_URL) return APP_BASE_URL;
  const protocol = String(req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim();
  const host = String(req.get("x-forwarded-host") || req.get("host") || `localhost:${PORT}`).split(",")[0].trim();
  return `${protocol}://${host}`.replace(/\/+$/, "");
}

function getOidcRedirectUri(req) {
  return OIDC_REDIRECT_URI || `${getPublicBaseUrl(req)}/auth/oidc/callback`;
}

function getOidcPostLogoutRedirectUri(req) {
  return OIDC_POST_LOGOUT_REDIRECT_URI || `${getPublicBaseUrl(req)}/`;
}

function getOidcDiscoveryUrl() {
  if (!OIDC_ISSUER) {
    throw new Error("OIDC issuer is not configured.");
  }

  if (OIDC_ISSUER.includes("/.well-known/openid-configuration")) {
    return OIDC_ISSUER;
  }

  return `${OIDC_ISSUER}/.well-known/openid-configuration`;
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        accept: "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    const raw = await response.text();
    let payload = null;

    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error(`Unexpected response from ${url}.`);
      }
    }

    if (!response.ok) {
      const message = payload?.error_description || payload?.error || response.statusText || "Request failed.";
      throw new Error(message);
    }

    return payload || {};
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request to ${url} timed out.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getOidcDiscovery(forceRefresh = false) {
  if (!OIDC_ENABLED) {
    throw new Error("Admin SSO is not configured.");
  }

  if (oidcDiscoveryCache && !forceRefresh) {
    return oidcDiscoveryCache;
  }

  if (!oidcDiscoveryPromise || forceRefresh) {
    oidcDiscoveryPromise = fetchJsonWithTimeout(getOidcDiscoveryUrl())
      .then((payload) => {
        if (!payload.authorization_endpoint || !payload.token_endpoint || !payload.jwks_uri) {
          throw new Error("OIDC discovery document is missing required endpoints.");
        }
        oidcDiscoveryCache = payload;
        return payload;
      })
      .finally(() => {
        oidcDiscoveryPromise = null;
      });
  }

  return oidcDiscoveryPromise;
}

async function getOidcJwks(forceRefresh = false) {
  const discovery = await getOidcDiscovery(forceRefresh);

  if (oidcJwksCache && !forceRefresh) {
    return oidcJwksCache;
  }

  if (!oidcJwksPromise || forceRefresh) {
    oidcJwksPromise = fetchJsonWithTimeout(discovery.jwks_uri)
      .then((payload) => {
        if (!Array.isArray(payload.keys)) {
          throw new Error("OIDC JWKS response is missing signing keys.");
        }
        oidcJwksCache = payload;
        return payload;
      })
      .finally(() => {
        oidcJwksPromise = null;
      });
  }

  return oidcJwksPromise;
}

function parseJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    throw new Error("OIDC ID token is malformed.");
  }

  try {
    return {
      header: JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")),
      payload: JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")),
      signature: Buffer.from(parts[2], "base64url"),
      signingInput: `${parts[0]}.${parts[1]}`,
    };
  } catch {
    throw new Error("OIDC ID token could not be parsed.");
  }
}

function findOidcJwk(jwks, jwtHeader) {
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  const rsaKeys = keys.filter((item) => item?.kty === "RSA");

  if (jwtHeader?.kid) {
    const exactMatch = rsaKeys.find((item) => item.kid === jwtHeader.kid);
    if (exactMatch) return exactMatch;
  }

  if (rsaKeys.length === 1) {
    return rsaKeys[0];
  }

  return null;
}

function verifyOidcJwtSignature(parsedToken, jwk) {
  const supportedAlgorithms = {
    RS256: "RSA-SHA256",
    RS384: "RSA-SHA384",
    RS512: "RSA-SHA512",
    PS256: "RSA-SHA256",
    PS384: "RSA-SHA384",
    PS512: "RSA-SHA512",
  };

  const nodeAlgorithm = supportedAlgorithms[parsedToken?.header?.alg];
  if (!nodeAlgorithm) {
    throw new Error(`OIDC signing algorithm ${String(parsedToken?.header?.alg || "unknown")} is not supported.`);
  }

  if (!jwk || jwk.kty !== "RSA") {
    throw new Error("OIDC signing key is unavailable.");
  }

  const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const verifyOptions = String(parsedToken.header.alg).startsWith("PS")
    ? {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      }
    : publicKey;

  return crypto.verify(nodeAlgorithm, Buffer.from(parsedToken.signingInput, "utf8"), verifyOptions, parsedToken.signature);
}

function getTokenAudienceList(audience) {
  if (Array.isArray(audience)) {
    return audience.map((item) => String(item));
  }

  if (audience === undefined || audience === null || audience === "") {
    return [];
  }

  return [String(audience)];
}

async function validateOidcIdToken(idToken, expectedNonce, discovery) {
  const parsedToken = parseJwt(idToken);

  let jwks = await getOidcJwks();
  let jwk = findOidcJwk(jwks, parsedToken.header);

  if (!jwk) {
    jwks = await getOidcJwks(true);
    jwk = findOidcJwk(jwks, parsedToken.header);
  }

  if (!jwk) {
    throw new Error("Unable to find an OIDC signing key for this token.");
  }

  if (!verifyOidcJwtSignature(parsedToken, jwk)) {
    throw new Error("Unable to verify the OIDC ID token signature.");
  }

  const payload = parsedToken.payload || {};
  const now = Math.floor(Date.now() / 1000);
  const issuer = normalizeUrlEnv(payload.iss);
  const expectedIssuer = normalizeUrlEnv(discovery?.issuer || OIDC_ISSUER);

  if (!issuer || issuer !== expectedIssuer) {
    throw new Error("OIDC issuer mismatch.");
  }

  const audiences = getTokenAudienceList(payload.aud);
  if (!audiences.includes(OIDC_CLIENT_ID)) {
    throw new Error("OIDC audience mismatch.");
  }

  if (payload.azp && String(payload.azp) !== OIDC_CLIENT_ID) {
    throw new Error("OIDC authorized party mismatch.");
  }

  if (expectedNonce && String(payload.nonce || "") !== String(expectedNonce)) {
    throw new Error("OIDC nonce mismatch.");
  }

  if (!payload.exp || Number(payload.exp) + OIDC_CLOCK_TOLERANCE_SEC < now) {
    throw new Error("OIDC ID token has expired.");
  }

  if (payload.nbf && Number(payload.nbf) - OIDC_CLOCK_TOLERANCE_SEC > now) {
    throw new Error("OIDC ID token is not active yet.");
  }

  if (payload.iat && Number(payload.iat) - OIDC_CLOCK_TOLERANCE_SEC > now) {
    throw new Error("OIDC ID token issue time is invalid.");
  }

  return payload;
}

function extractOidcRoles(claims) {
  const roles = new Set();
  const realmRoles = Array.isArray(claims?.realm_access?.roles) ? claims.realm_access.roles : [];
  const resourceAccess = claims?.resource_access && typeof claims.resource_access === "object" ? claims.resource_access : {};

  realmRoles.forEach((role) => roles.add(String(role)));

  Object.values(resourceAccess).forEach((entry) => {
    if (!Array.isArray(entry?.roles)) return;
    entry.roles.forEach((role) => roles.add(String(role)));
  });

  return Array.from(roles);
}

function getOidcDisplayName(claims) {
  const fullName = String(claims?.name || "").trim();
  if (fullName) return fullName;

  const givenName = String(claims?.given_name || "").trim();
  const familyName = String(claims?.family_name || "").trim();
  const joined = [givenName, familyName].filter(Boolean).join(" ").trim();
  if (joined) return joined;

  return String(claims?.preferred_username || claims?.email || claims?.sub || "LabCenter Admin");
}

function buildOidcErrorRedirect(req, message) {
  const redirectUrl = new URL("/", getPublicBaseUrl(req));
  redirectUrl.searchParams.set("authError", String(message || "Unable to sign in."));
  return redirectUrl.toString();
}

function buildOidcLogoutUrl(req, discovery, oidcSession) {
  if (!discovery?.end_session_endpoint) {
    return "";
  }

  const logoutUrl = new URL(discovery.end_session_endpoint);
  logoutUrl.searchParams.set("post_logout_redirect_uri", getOidcPostLogoutRedirectUri(req));
  logoutUrl.searchParams.set("client_id", OIDC_CLIENT_ID);

  if (oidcSession?.idToken) {
    logoutUrl.searchParams.set("id_token_hint", oidcSession.idToken);
  }

  return logoutUrl.toString();
}

function saveSessionAsync(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) return reject(error);
      return resolve();
    });
  });
}

function regenerateSessionAsync(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      return resolve();
    });
  });
}

function destroySessionAsync(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) return reject(error);
      return resolve();
    });
  });
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || "unknown";
}

function auditLog(req, event, outcome, details = {}) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    outcome,
    ip: getClientIp(req),
    ua: req.get("user-agent") || "unknown",
    sessionId: req.sessionID || null,
    ...details,
  };

  fs.appendFile(auditPath, `${JSON.stringify(entry)}\n`, () => {});
}

function lockKey(email, ip) {
  return `${String(email || "").toLowerCase()}|${ip}`;
}

function pruneFailures(now, record) {
  record.attempts = record.attempts.filter((ts) => now - ts < FAIL_WINDOW_MS);
}

function registerFailure(key) {
  const now = Date.now();
  const record = failedLoginAttempts.get(key) || { attempts: [], lockedUntil: 0 };
  pruneFailures(now, record);
  record.attempts.push(now);
  if (record.attempts.length >= FAIL_LIMIT) {
    record.lockedUntil = now + LOCKOUT_MS;
    record.attempts = [];
  }
  failedLoginAttempts.set(key, record);
}

function getLockoutRemaining(key) {
  const now = Date.now();
  const record = failedLoginAttempts.get(key);
  if (!record) return 0;
  pruneFailures(now, record);
  const remaining = Math.max(0, record.lockedUntil - now);
  failedLoginAttempts.set(key, record);
  return remaining;
}

function clearFailures(key) {
  failedLoginAttempts.delete(key);
}

function normalizePortalUsername(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function isPortalAccessEnabled(accessType) {
  return accessType === "report_view" || accessType === "report_view_order";
}

function requireDoctorAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Doctor authentication required." });
  }
  next();
}

function hasRequisitionAccess(req) {
  if (req?.session?.user) return true;
  return req?.session?.clientUser?.accessType === "report_view_order";
}

function requireAuthenticatedUser(req, res, next) {
  if (!req.session.user && !req.session.clientUser) {
    return res.status(401).json({ error: "Authentication required." });
  }
  next();
}

function normalizeMatchKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function sanitizeFacilityRecord(record) {
  const cloned = JSON.parse(JSON.stringify(record || {}));
  const hasPortalPassword = Boolean(cloned?.portal_password_hash || cloned?.portal?.passwordHash);
  const hasEncryptedReportsPassword = Boolean(
    cloned?.encrypted_reports_password || cloned?.provider_configuration?.encryptedReportsPassword
  );

  delete cloned.portal_password_hash;
  delete cloned.encrypted_reports_password;

  if (cloned.portal && typeof cloned.portal === "object") {
    delete cloned.portal.passwordHash;
    cloned.portal.passwordConfigured = hasPortalPassword;
  }
  if (cloned.provider_configuration && typeof cloned.provider_configuration === "object") {
    delete cloned.provider_configuration.encryptedReportsPassword;
    cloned.provider_configuration.encryptedReportsPasswordConfigured = hasEncryptedReportsPassword;
  }

  cloned.portal_has_password = hasPortalPassword;
  cloned.encrypted_reports_password_configured = hasEncryptedReportsPassword;
  return cloned;
}

function getFacilityDataForSession(req) {
  const facilityData = loadFacilityData();
  if (req?.session?.user) {
    return {
      accounts: facilityData.accounts.map(sanitizeFacilityRecord),
      providers: facilityData.providers.map(sanitizeFacilityRecord),
    };
  }

  const clientUser = req?.session?.clientUser;
  if (!clientUser) return { accounts: [], providers: [] };

  const clientId = normalizeMatchKey(clientUser.accountId);
  const clientName = normalizeMatchKey(clientUser.accountName);
  const accountMatches = (row) =>
    [row?.id, row?.name, row?.account_code].some((value) => {
      const normalized = normalizeMatchKey(value);
      return normalized && (normalized === clientId || normalized === clientName);
    });
  const providerMatches = (row) =>
    [row?.provider_id, row?.provider_name, row?.validator_name, row?.display_name].some((value) => {
      const normalized = normalizeMatchKey(value);
      return normalized && (normalized === clientId || normalized === clientName);
    });

  const accounts = [];
  const providers = [];

  if (clientUser.entityType === "account") {
    const matchingAccounts = facilityData.accounts.filter(accountMatches);
    const accountKeys = new Set(
      matchingAccounts
        .flatMap((row) => [row?.id, row?.name, row?.account_code])
        .map(normalizeMatchKey)
        .filter(Boolean)
    );

    accounts.push(...matchingAccounts.map(sanitizeFacilityRecord));
    providers.push(
      ...facilityData.providers
        .filter((row) =>
          [row?.account, row?.provider_configuration?.accounts].some((value) => accountKeys.has(normalizeMatchKey(value)))
        )
        .map(sanitizeFacilityRecord)
    );
  } else {
    const matchingProviders = facilityData.providers.filter(providerMatches);
    const accountKeys = new Set(
      matchingProviders
        .flatMap((row) => [row?.account, row?.provider_configuration?.accounts])
        .map(normalizeMatchKey)
        .filter(Boolean)
    );

    providers.push(...matchingProviders.map(sanitizeFacilityRecord));
    accounts.push(
      ...facilityData.accounts
        .filter((row) => {
          const id = normalizeMatchKey(row?.id);
          const name = normalizeMatchKey(row?.name);
          return accountKeys.has(id) || accountKeys.has(name);
        })
        .map(sanitizeFacilityRecord)
    );
  }

  return { accounts, providers };
}

function getPortalAccessScope(req) {
  if (req?.session?.user) {
    return {
      matchesOrder: () => true,
      matchesRegistration: () => true,
      matchesUploadLog: () => true,
    };
  }

  const scopedFacilityData = getFacilityDataForSession(req);
  const accountKeys = new Set(
    (Array.isArray(scopedFacilityData?.accounts) ? scopedFacilityData.accounts : [])
      .flatMap((row) => [row?.id, row?.name, row?.account_code])
      .map(normalizeMatchKey)
      .filter(Boolean)
  );
  const providerKeys = new Set(
    (Array.isArray(scopedFacilityData?.providers) ? scopedFacilityData.providers : [])
      .flatMap((row) => [row?.provider_id, row?.provider_name, row?.validator_name, row?.display_name, row?.account])
      .map(normalizeMatchKey)
      .filter(Boolean)
  );

  const matchAny = (values, keys) => values.some((value) => {
    const normalized = normalizeMatchKey(value);
    return normalized && keys.has(normalized);
  });

  return {
    matchesOrder(order) {
      if (!order) return false;
      return (
        matchAny([order?.facilityName, order?.accountId, order?.accountName], accountKeys)
        || matchAny([order?.provider, order?.providerId], providerKeys)
      );
    },
    matchesRegistration(registration) {
      if (!registration) return false;
      return (
        matchAny([registration?.facilityName, registration?.accountId, registration?.accountName], accountKeys)
        || matchAny([registration?.provider, registration?.providerId], providerKeys)
      );
    },
    matchesUploadLog(entry, visibleOrderIds) {
      const ids = Array.isArray(entry?.updatedOrderIds)
        ? entry.updatedOrderIds.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      if (!ids.length) return false;
      return ids.some((value) => visibleOrderIds.has(value));
    },
  };
}

function canAccessOrderRecord(req, order) {
  return getPortalAccessScope(req).matchesOrder(order);
}

function getPortalDataForSession(req) {
  const scope = getPortalAccessScope(req);
  const orders = portalStore.listOrders().filter((order) => scope.matchesOrder(order));
  const visibleOrderIds = new Set(orders.map((order) => String(order?.orderId || "").trim()).filter(Boolean));
  const registrations = portalStore.listRegistrations().filter((registration) => scope.matchesRegistration(registration));
  const uploadResultsLog = req?.session?.user
    ? portalStore.listUploadLogs()
    : portalStore.listUploadLogs().filter((entry) => scope.matchesUploadLog(entry, visibleOrderIds));

  return {
    registrations,
    orders,
    uploadResultsLog: uploadResultsLog.slice(0, 200),
  };
}

function resolveAccountIndex(accounts, identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return -1;
  if (raw.startsWith("idx-")) {
    const idx = Number(raw.slice(4));
    return Number.isInteger(idx) && idx >= 0 && idx < accounts.length ? idx : -1;
  }
  return accounts.findIndex((item) => String(item?.id || "") === raw);
}

function resolveProviderIndex(providers, identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return -1;
  if (raw.startsWith("idx-")) {
    const idx = Number(raw.slice(4));
    return Number.isInteger(idx) && idx >= 0 && idx < providers.length ? idx : -1;
  }
  return providers.findIndex((item) => String(item?.provider_id || "") === raw);
}

function parseProviderDisplayName(rawName) {
  const full = String(rawName || "").trim();
  if (!full) return { designation: "", providerName: "" };
  const match = full.match(/^(Dr\.|Mr\.|Ms\.|Mrs\.)\s+(.+)$/i);
  if (!match) return { designation: "", providerName: full };
  const normalizedDesignation = ["Dr.", "Mr.", "Ms.", "Mrs."].find(
    (candidate) => candidate.toLowerCase() === String(match[1]).toLowerCase()
  );
  return {
    designation: normalizedDesignation || "",
    providerName: String(match[2] || "").trim(),
  };
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function findEndOfCentralDirectory(zipBuffer) {
  for (let i = zipBuffer.length - 22; i >= 0; i -= 1) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("Invalid zip: EOCD not found");
}

function readZipEntries(zipBuffer) {
  const eocdOffset = findEndOfCentralDirectory(zipBuffer);
  const centralDirSize = zipBuffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const entryMap = new Map();
  let cursor = centralDirOffset;
  const end = centralDirOffset + centralDirSize;

  while (cursor < end) {
    if (zipBuffer.readUInt32LE(cursor) !== 0x02014b50) break;
    const compressionMethod = zipBuffer.readUInt16LE(cursor + 10);
    const compressedSize = zipBuffer.readUInt32LE(cursor + 20);
    const fileNameLength = zipBuffer.readUInt16LE(cursor + 28);
    const extraFieldLength = zipBuffer.readUInt16LE(cursor + 30);
    const commentLength = zipBuffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(cursor + 42);
    const fileName = zipBuffer.slice(cursor + 46, cursor + 46 + fileNameLength).toString("utf8");

    entryMap.set(fileName, {
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });

    cursor += 46 + fileNameLength + extraFieldLength + commentLength;
  }

  return entryMap;
}

function readZipEntryBuffer(zipBuffer, entries, fileName) {
  const entry = entries.get(fileName);
  if (!entry) throw new Error(`Missing zip entry: ${fileName}`);
  const localOffset = entry.localHeaderOffset;
  if (zipBuffer.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error(`Invalid local file header for ${fileName}`);
  }
  const fileNameLength = zipBuffer.readUInt16LE(localOffset + 26);
  const extraFieldLength = zipBuffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + fileNameLength + extraFieldLength;
  const compressedData = zipBuffer.slice(dataStart, dataStart + entry.compressedSize);
  if (entry.compressionMethod === 0) return compressedData;
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressedData);
  throw new Error(`Unsupported zip compression method: ${entry.compressionMethod}`);
}

function columnRefToIndex(columnRef) {
  let total = 0;
  for (const char of columnRef) {
    total = total * 26 + (char.charCodeAt(0) - 64);
  }
  return total - 1;
}

function parseSharedStrings(sharedXml) {
  const strings = [];
  const stringItems = sharedXml.match(/<si[\s\S]*?<\/si>/g) || [];
  stringItems.forEach((item) => {
    const fragments = [...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((match) => decodeXmlEntities(match[1]))
      .join("");
    strings.push(fragments);
  });
  return strings;
}

function parseWorksheetRows(sheetXml, sharedStrings) {
  const rows = [];
  const rowMatches = sheetXml.match(/<row\b[\s\S]*?<\/row>/g) || [];

  rowMatches.forEach((rowXml) => {
    const rowData = {};
    const cellMatches = [...rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)];
    cellMatches.forEach((cellMatch) => {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      if (!refMatch) return;
      const colIndex = columnRefToIndex(refMatch[1]);
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "";
      let value = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (type === "s") value = sharedStrings[Number(value)] || "";
      if (type === "inlineStr") {
        value = decodeXmlEntities((body.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "");
      }
      rowData[colIndex] = decodeXmlEntities(value === undefined ? "" : value);
    });

    const keys = Object.keys(rowData).map(Number);
    if (!keys.length) {
      rows.push([]);
      return;
    }
    const maxIndex = Math.max(...keys);
    const row = [];
    for (let i = 0; i <= maxIndex; i += 1) row.push(rowData[i] || "");
    rows.push(row);
  });

  return rows;
}

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseCtNumber(rawValue) {
  if (rawValue === null || rawValue === undefined) return null;
  const value = String(rawValue).trim();
  if (!value || value.toLowerCase() === "undetermined") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function classifyCt(ct) {
  if (ct === null) return "Negative";
  if (ct >= 0 && ct <= 25) return "High Pathogen Load";
  if (ct <= 30) return "Moderate";
  if (ct <= 33) return "Low Pathogen Load";
  return "Negative";
}

function buildResultStatus(ampStatus, ct) {
  const normalized = String(ampStatus || "").toLowerCase();
  if (normalized.includes("inconclusive")) return "Inconclusive";
  if (normalized.includes("no amp") || normalized.includes("undetermined")) return "Not Detected";
  if (normalized.includes("amp")) {
    const bucket = classifyCt(ct);
    if (bucket === "High Pathogen Load") return "Detected - High";
    if (bucket === "Moderate") return "Detected - Moderate";
    if (bucket === "Low Pathogen Load") return "Detected - Low";
    return "Negative";
  }
  if (ct !== null) {
    const bucket = classifyCt(ct);
    if (bucket === "High Pathogen Load") return "Detected - High";
    if (bucket === "Moderate") return "Detected - Moderate";
    if (bucket === "Low Pathogen Load") return "Detected - Low";
    return "Negative";
  }
  return "Not Detected";
}

function normalizeSampleIdentifier(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function rowMatchesExpectedSample(row, expectedSampleId) {
  const sampleToken = normalizeSampleIdentifier(row?.sample);
  const expectedToken = normalizeSampleIdentifier(expectedSampleId);
  if (!sampleToken || !expectedToken) return false;
  return (
    sampleToken === expectedToken
    || sampleToken.includes(expectedToken)
    || expectedToken.includes(sampleToken)
  );
}

function filterReportBySample(report, expectedSampleId) {
  const normalizedExpected = normalizeSampleIdentifier(expectedSampleId);
  if (!normalizedExpected) return report;

  const detailedSource = Array.isArray(report?.detailed) ? report.detailed : [];
  const filteredDetailed = detailedSource.filter((row) => rowMatchesExpectedSample(row, expectedSampleId));
  const filteredDetected = filteredDetailed.filter((row) => String(row?.result || "").startsWith("Detected"));
  const uniqueSamples = [...new Set(filteredDetailed.map((row) => row.sample).filter(Boolean))];

  return {
    ...report,
    summary: {
      ...(report?.summary || {}),
      sampleCount: uniqueSamples.length,
      totalRows: filteredDetailed.length,
      detectedCount: filteredDetected.length,
    },
    detected: filteredDetected,
    detailed: filteredDetailed,
  };
}

function parseLabWorkbook(buffer, panelName = "Lab Panel") {
  const entries = readZipEntries(buffer);
  const sharedXml = readZipEntryBuffer(buffer, entries, "xl/sharedStrings.xml").toString("utf8");
  const sheetXml = readZipEntryBuffer(buffer, entries, "xl/worksheets/sheet1.xml").toString("utf8");
  const sharedStrings = parseSharedStrings(sharedXml);
  const rows = parseWorksheetRows(sheetXml, sharedStrings);

  const headerRowIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return (
      normalized.includes("well") &&
      normalized.includes("sample") &&
      normalized.includes("target") &&
      normalized.includes("amp status") &&
      (normalized.includes("cq") || normalized.includes("ct") || normalized.includes("ct value"))
    );
  });

  if (headerRowIndex < 0) throw new Error("Target worksheet schema not found");
  const header = rows[headerRowIndex].map(normalizeHeader);
  const findColumn = (aliases) => header.findIndex((name) => aliases.includes(name));
  const idx = {
    well: findColumn(["well"]),
    sample: findColumn(["sample", "sample name"]),
    target: findColumn(["target", "target name"]),
    ampStatus: findColumn(["amp status", "ampstatus", "result"]),
    cq: findColumn(["cq", "ct", "ct value"]),
  };

  if (idx.target < 0) throw new Error("Target column not found");

  const metadata = {};
  for (let i = 0; i < headerRowIndex; i += 1) {
    const key = String(rows[i][0] || "").trim();
    const value = String(rows[i][1] || "").trim();
    if (key) metadata[key] = value;
  }

  const detailed = [];
  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const target = String(row[idx.target] || "").trim();
    const sample = idx.sample >= 0 ? String(row[idx.sample] || "").trim() : "";
    const ampStatus = idx.ampStatus >= 0 ? String(row[idx.ampStatus] || "").trim() : "";
    const cqRaw = idx.cq >= 0 ? String(row[idx.cq] || "").trim() : "";
    const well = idx.well >= 0 ? String(row[idx.well] || "").trim() : "";
    if (!target && !sample && !ampStatus && !cqRaw) continue;

    const ctValue = parseCtNumber(cqRaw);
    const result = buildResultStatus(ampStatus, ctValue);
    detailed.push({
      sample,
      well,
      pathogen: target || "-",
      ampStatus: ampStatus || "-",
      ctValue: ctValue === null ? "" : Number(ctValue.toFixed(2)),
      ctRaw: cqRaw || "",
      result,
      classification: classifyCt(ctValue),
    });
  }

  const detected = detailed.filter((row) => row.result.startsWith("Detected"));
  const uniqueSamples = [...new Set(detailed.map((row) => row.sample).filter(Boolean))];

  return {
    panelName,
    metadata,
    summary: {
      sampleCount: uniqueSamples.length,
      totalRows: detailed.length,
      detectedCount: detected.length,
    },
    detected,
    detailed,
  };
}

function hasReportPdfAccess(req) {
  return Boolean(req?.session?.user || req?.session?.clientUser);
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "::ffff:127.0.0.1";
}

function shouldUseS3ForRequest(req) {
  if (!s3Storage.enabled) return false;
  const requestHost = String(req?.hostname || req?.headers?.host || "")
    .trim()
    .split(":")[0];
  return !isLoopbackHostname(requestHost);
}

function sanitizeReportPdfFileName(value) {
  const raw = String(value || "").trim();
  const cleaned = raw
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  if (!cleaned) return `Final_Report_${Date.now()}.pdf`;
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

function sanitizePharmdHl7FileName(value) {
  const raw = String(value || "").trim();
  const cleaned = raw
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160);
  if (!cleaned) return `PharmD_ORU_${Date.now()}.hl7`;
  return /\.(hl7|txt)$/i.test(cleaned) ? cleaned : `${cleaned}.hl7`;
}

function createPharmdLogEntry(level, step, message, extra = {}) {
  return {
    ts: new Date().toISOString(),
    level: String(level || "info").trim() || "info",
    step: String(step || "general").trim() || "general",
    message: String(message || "").trim() || "PharmD event",
    ...extra,
  };
}

function mergePharmdLogs(existingLogs, nextLogs, limit = 100) {
  const current = Array.isArray(existingLogs) ? existingLogs.filter(Boolean) : [];
  const incoming = Array.isArray(nextLogs) ? nextLogs.filter(Boolean) : [];
  return [...current, ...incoming].slice(-Math.max(1, limit));
}

function getPharmdSftpConfig() {
  return {
    host: PHARMD_SFTP_HOST,
    port: PHARMD_SFTP_PORT,
    username: PHARMD_SFTP_USERNAME,
    password: PHARMD_SFTP_PASSWORD,
    remoteDir: PHARMD_SFTP_ORU_DIR,
    timeoutSec: PHARMD_SFTP_TIMEOUT_SEC,
  };
}

function getPharmdSftpPublicConfig(config = {}) {
  return {
    host: String(config.host || "").trim(),
    port: Math.max(1, Math.floor(Number(config.port || 0) || 0)),
    username: String(config.username || "").trim(),
    remoteDir: String(config.remoteDir || "").trim(),
    timeoutSec: Math.max(1, Math.floor(Number(config.timeoutSec || 0) || 0)),
  };
}

function buildPharmdRemotePath(remoteDir, fileName) {
  const dir = String(remoteDir || "").trim().replace(/^\/+|\/+$/g, "");
  if (!dir) return fileName;
  return `${dir}/${fileName}`;
}

function parsePharmdExpectMarkers(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("@@"));
}

function buildPharmdSftpExpectScript() {
  return `#!/usr/bin/expect -f
set host [lindex $argv 0]
set port [lindex $argv 1]
set username [lindex $argv 2]
set password [lindex $argv 3]
set remoteDir [lindex $argv 4]
set localPath [lindex $argv 5]
set remoteFile [lindex $argv 6]
set timeout [lindex $argv 7]

proc fail {message code} {
  puts "@@ERROR@@$message"
  exit $code
}

spawn /usr/bin/sftp -oStrictHostKeyChecking=no -oUserKnownHostsFile=/dev/null -P $port "$username@$host"
expect {
  -re "Are you sure you want to continue connecting.*" { send -- "yes\\r"; exp_continue }
  -re "(?i)password:" { send -- "$password\\r"; exp_continue }
  -re "Permission denied" { fail "Permission denied while connecting to PharmD SFTP." 31 }
  -re "Connection refused" { fail "Connection refused by PharmD SFTP server." 32 }
  -re "No route to host" { fail "No route to PharmD SFTP host." 33 }
  -re "Could not resolve hostname.*" { fail "Unable to resolve PharmD SFTP host." 34 }
  -re "Connection closed.*" { fail "Connection closed before SFTP session was established." 35 }
  -re {sftp>} { puts "@@CONNECTED@@"; }
  timeout { fail "Timed out while connecting to PharmD SFTP." 36 }
  eof { fail "SFTP session ended before login completed." 37 }
}

if {$remoteDir ne ""} {
  send -- "cd $remoteDir\\r"
  expect {
    -re "No such file or directory" { fail "Remote directory '$remoteDir' was not found." 38 }
    -re "Couldn't.*" { fail "Unable to enter remote directory '$remoteDir'." 39 }
    -re {sftp>} { puts "@@REMOTE_DIR@@$remoteDir"; }
    timeout { fail "Timed out while opening remote directory '$remoteDir'." 40 }
    eof { fail "SFTP session ended before remote directory was confirmed." 41 }
  }
}

send -- "put \\"$localPath\\" \\"$remoteFile\\"\\r"
expect {
  -re "Uploading .*" { exp_continue }
  -re "100%.*" { exp_continue }
  -re "Permission denied" { fail "Permission denied while uploading the PharmD HL7 file." 42 }
  -re "Couldn't.*" { fail "Unable to upload the PharmD HL7 file." 43 }
  -re {sftp>} { puts "@@UPLOADED@@$remoteFile"; }
  timeout { fail "Timed out while uploading the PharmD HL7 file." 44 }
  eof { fail "SFTP session ended before upload completed." 45 }
}

send -- "bye\\r"
expect eof
puts "@@DONE@@"
exit 0
`;
}

function executePharmdSftpUpload({ oruMessage, fileName, config }) {
  return new Promise((resolve, reject) => {
    const messageText = String(oruMessage || "");
    const safeFileName = sanitizePharmdHl7FileName(fileName);
    const connection = getPharmdSftpPublicConfig(config);
    const expectBinary = "/usr/bin/expect";
    const sftpBinary = "/usr/bin/sftp";
    const logs = [
      createPharmdLogEntry("info", "prepare", `Preparing PharmD ORU upload for ${safeFileName}.`, {
        host: connection.host,
        port: connection.port,
        username: connection.username,
        remoteDir: connection.remoteDir,
      }),
    ];

    if (!messageText.trim()) {
      reject({
        message: "PharmD ORU message is empty and cannot be sent.",
        logs: [...logs, createPharmdLogEntry("error", "prepare", "PharmD ORU message is empty.")],
      });
      return;
    }

    if (!connection.host || !connection.port || !connection.username) {
      reject({
        message: "PharmD SFTP host, port, or username is not configured.",
        logs: [...logs, createPharmdLogEntry("error", "config", "PharmD SFTP host, port, or username is not configured.")],
      });
      return;
    }

    if (!String(config?.password || "").trim()) {
      reject({
        message: "PharmD SFTP password is not configured. Set PHARMD_SFTP_PASSWORD before sending.",
        logs: [...logs, createPharmdLogEntry("error", "config", "PharmD SFTP password is not configured.")],
      });
      return;
    }

    if (process.platform === "win32") {
      reject({
        message: "PharmD SFTP send is currently supported only on macOS/Linux runtimes with expect and sftp installed.",
        logs: [...logs, createPharmdLogEntry("error", "runtime", "PharmD SFTP send is not supported on this runtime.")],
      });
      return;
    }

    if (!fs.existsSync(expectBinary) || !fs.existsSync(sftpBinary)) {
      reject({
        message: "PharmD SFTP tools are missing. This machine needs both /usr/bin/expect and /usr/bin/sftp.",
        logs: [...logs, createPharmdLogEntry("error", "runtime", "Required PharmD SFTP tools are missing from this machine.")],
      });
      return;
    }

    let tempDir = "";
    try {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-pharmd-"));
    } catch {
      reject({
        message: "Unable to create a temporary workspace for PharmD upload.",
        logs: [...logs, createPharmdLogEntry("error", "prepare", "Unable to create a temporary workspace for PharmD upload.")],
      });
      return;
    }

    const localPath = path.join(tempDir, safeFileName);
    const scriptPath = path.join(tempDir, "pharmd-send.expect");
    const cleanup = () => {
      if (!tempDir) return;
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Best effort cleanup only.
      }
      tempDir = "";
    };

    try {
      fs.writeFileSync(localPath, messageText, "utf8");
      fs.writeFileSync(scriptPath, buildPharmdSftpExpectScript(), "utf8");
    } catch {
      cleanup();
      reject({
        message: "Unable to prepare temporary PharmD upload files.",
        logs: [...logs, createPharmdLogEntry("error", "prepare", "Unable to prepare temporary PharmD upload files.")],
      });
      return;
    }

    const child = spawn(expectBinary, [
      scriptPath,
      connection.host,
      String(connection.port),
      connection.username,
      String(config.password || ""),
      connection.remoteDir || "",
      localPath,
      safeFileName,
      String(connection.timeoutSec || 30),
    ], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (error, payload = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(payload);
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // No-op.
      }
      finish({
        message: "Timed out while sending the PharmD HL7 file.",
        logs: [...logs, createPharmdLogEntry("error", "timeout", "Timed out while sending the PharmD HL7 file.")],
      });
    }, Math.max(10000, (connection.timeoutSec + 15) * 1000));

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        message: `Unable to launch PharmD SFTP client: ${error.message}`,
        logs: [...logs, createPharmdLogEntry("error", "launch", `Unable to launch PharmD SFTP client: ${error.message}`)],
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const markers = parsePharmdExpectMarkers(`${stdout}\n${stderr}`);
      const markerLogs = [];
      let connectedAt = "";
      let uploadedAt = "";

      markers.forEach((marker) => {
        if (marker === "@@CONNECTED@@") {
          connectedAt = connectedAt || new Date().toISOString();
          markerLogs.push(createPharmdLogEntry("success", "connect", "Connection to PharmD SFTP established successfully."));
          return;
        }
        if (marker.startsWith("@@REMOTE_DIR@@")) {
          const remoteDir = marker.replace("@@REMOTE_DIR@@", "").trim() || connection.remoteDir || "";
          markerLogs.push(createPharmdLogEntry("success", "remote_dir", `Remote PharmD folder confirmed: ${remoteDir || "."}.`));
          return;
        }
        if (marker.startsWith("@@UPLOADED@@")) {
          const uploadedFile = marker.replace("@@UPLOADED@@", "").trim() || safeFileName;
          uploadedAt = uploadedAt || new Date().toISOString();
          markerLogs.push(createPharmdLogEntry("success", "upload", `HL7 file uploaded successfully to PharmD as ${uploadedFile}.`));
          return;
        }
        if (marker === "@@DONE@@") {
          markerLogs.push(createPharmdLogEntry("info", "complete", "PharmD SFTP session closed cleanly."));
          return;
        }
        if (marker.startsWith("@@ERROR@@")) {
          const message = marker.replace("@@ERROR@@", "").trim() || "PharmD SFTP upload failed.";
          markerLogs.push(createPharmdLogEntry("error", "error", message));
        }
      });

      const hasUploadedMarker = markerLogs.some((entry) => entry.step === "upload" && entry.level === "success");
      if (code !== 0 || !hasUploadedMarker) {
        const markerError = markerLogs.find((entry) => entry.level === "error")?.message;
        const details = (stderr || stdout || "").trim();
        const message = markerError || details || `PharmD SFTP upload failed with exit code ${code}.`;
        finish({
          message,
          logs: [...logs, ...markerLogs, createPharmdLogEntry("error", "complete", message)],
        });
        return;
      }

      finish(null, {
        message: `PharmD HL7 file uploaded successfully to ${buildPharmdRemotePath(connection.remoteDir, safeFileName)}.`,
        logs: [...logs, ...markerLogs],
        connectionEstablishedAt: connectedAt || new Date().toISOString(),
        sentAt: uploadedAt || new Date().toISOString(),
        remotePath: buildPharmdRemotePath(connection.remoteDir, safeFileName),
        fileName: safeFileName,
      });
    });
  });
}

function splitPublishValues(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.flatMap((item) => splitPublishValues(item)).filter(Boolean);
  }
  return String(rawValue || "")
    .split(/[\n,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractEmailRecipients(...values) {
  const seen = new Set();
  const recipients = [];
  values
    .flatMap((value) => splitPublishValues(value))
    .flatMap((value) => String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .forEach((value) => {
      if (seen.has(value)) return;
      seen.add(value);
      recipients.push(value);
    });
  return recipients;
}

function normalizeFaxRecipient(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  return digits.length >= 10 ? digits : "";
}

function getOrderFacilityKeys(order, facilityData) {
  const keys = new Set();
  const facilityName = String(order?.facilityName || "").trim();
  const needle = normalizeMatchKey(facilityName);
  if (needle) keys.add(needle);
  const accounts = Array.isArray(facilityData?.accounts) ? facilityData.accounts : [];
  const matchedAccount = accounts.find((row) =>
    [row?.id, row?.name, row?.account_code, row?.facility_name, row?.facilityName, row?.basic_information?.accountName]
      .map(normalizeMatchKey)
      .some((value) => value && value === needle)
  );
  [
    matchedAccount?.id,
    matchedAccount?.name,
    matchedAccount?.account_code,
    matchedAccount?.facility_name,
    matchedAccount?.facilityName,
    matchedAccount?.basic_information?.accountName,
  ]
    .map(normalizeMatchKey)
    .filter(Boolean)
    .forEach((value) => keys.add(value));
  return keys;
}

function getProviderFacilityKeys(providerRow) {
  return new Set(
    [
      providerRow?.account,
      providerRow?.accounts,
      providerRow?.provider_configuration?.accounts,
      providerRow?.provider_information?.accounts,
    ]
      .flatMap((value) => splitPublishValues(value))
      .map(normalizeMatchKey)
      .filter(Boolean)
  );
}

function resolveProviderForOrderPublish(order) {
  const facilityData = loadFacilityData();
  const providers = Array.isArray(facilityData?.providers) ? facilityData.providers : [];
  const providerNeedle = normalizeMatchKey(order?.provider);
  const providerNpi = String(order?.providerNpi || "").replace(/\D+/g, "");
  const facilityKeys = getOrderFacilityKeys(order, facilityData);

  let matches = providers.filter((row) => {
    const nameMatch = providerNeedle
      && [row?.validator_name, row?.provider_name, row?.display_name, row?.provider_information?.providerName]
        .map(normalizeMatchKey)
        .some((value) => value && value === providerNeedle);
    const npiMatch = providerNpi
      && String(row?.npi || row?.provider_information?.npi || "").replace(/\D+/g, "") === providerNpi;
    return Boolean(nameMatch || npiMatch);
  });

  if (!matches.length && facilityKeys.size) {
    matches = providers.filter((row) => {
      const providerKeys = getProviderFacilityKeys(row);
      return [...providerKeys].some((value) => facilityKeys.has(value));
    });
  }

  if (matches.length > 1 && facilityKeys.size) {
    const narrowed = matches.filter((row) => {
      const providerKeys = getProviderFacilityKeys(row);
      return [...providerKeys].some((value) => facilityKeys.has(value));
    });
    if (narrowed.length) matches = narrowed;
  }

  return matches[0] || null;
}

function getProviderPublishTargets(providerRow) {
  const configuration = providerRow?.provider_configuration && typeof providerRow.provider_configuration === "object"
    ? providerRow.provider_configuration
    : {};
  const sendEmail = "sendEmail" in configuration ? Boolean(configuration.sendEmail) : Boolean(providerRow?.send_email);
  const sendFax = "sendFax" in configuration ? Boolean(configuration.sendFax) : Boolean(providerRow?.send_fax);
  const emailRecipients = extractEmailRecipients(
    providerRow?.email_id,
    providerRow?.alternate_emails,
    configuration.email,
    configuration.alternateEmails,
    providerRow?.provider_information?.email
  );
  const faxRecipient = normalizeFaxRecipient(
    providerRow?.fax_number || configuration.faxNumber || providerRow?.provider_information?.faxNumber
  );
  return { sendEmail, sendFax, emailRecipients, faxRecipient };
}

async function persistRenderedReportBuffer(req, existingOrder, pdfBuffer, { orderId, fileName, reportType }) {
  const generatedAt = new Date().toISOString();
  if (shouldUseS3ForRequest(req)) {
    const storedReport = await s3Storage.uploadBuffer({
      key: buildStoredFileKey("reports", reportType, orderId || "unassigned", `${generatedAt}-${fileName}`),
      body: pdfBuffer,
      contentType: "application/pdf",
      metadata: {
        orderid: orderId,
        reporttype: reportType,
        filename: fileName,
      },
      contentDisposition: `inline; filename="${fileName}"`,
      cacheControl: "private, max-age=0, no-store",
    });
    portalStore.saveOrderFile({
      orderId,
      fileRole: "report_pdf",
      reportType,
      bucket: storedReport.bucket,
      key: storedReport.key,
      fileName,
      mimeType: "application/pdf",
      sizeBytes: storedReport.sizeBytes,
      createdAt: generatedAt,
      metadata: {
        generatedAt,
      },
    });
    if (existingOrder) {
      portalStore.upsertOrders([
        {
          ...existingOrder,
          generatedReports: {
            ...(existingOrder.generatedReports || {}),
            [reportType]: {
              bucket: storedReport.bucket,
              key: storedReport.key,
              fileName,
              mimeType: "application/pdf",
              sizeBytes: storedReport.sizeBytes,
              generatedAt,
            },
          },
          updatedAt: generatedAt,
        },
      ]);
    }
  }
  return generatedAt;
}

function inferMimeTypeFromFileName(fileName) {
  const ext = path.extname(String(fileName || "").trim()).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".csv") return "text/csv";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".xls") return "application/vnd.ms-excel";
  if (ext === ".xlsm") return "application/vnd.ms-excel.sheet.macroEnabled.12";
  return "application/octet-stream";
}

function buildStoredFileKey(...segments) {
  return segments
    .flat()
    .map((segment) => sanitizeS3PathSegment(segment))
    .filter(Boolean)
    .join("/");
}

function resolveUploadedScanExtension(fileName, mimeType = "") {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  const allowed = new Set([".pdf", ".png", ".jpg", ".jpeg", ".heic", ".heif", ".tif", ".tiff"]);
  if (allowed.has(ext)) return ext;

  const mimeMap = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "image/tiff": ".tiff",
  };
  return mimeMap[String(mimeType || "").toLowerCase()] || "";
}

function sanitizeUploadedScanFileName(fileName, mimeType = "") {
  const ext = resolveUploadedScanExtension(fileName, mimeType);
  const rawBase = path.basename(String(fileName || ""), path.extname(String(fileName || "")));
  const cleanedBase = rawBase
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return `${cleanedBase || `requisition_scan_${Date.now()}`}${ext || ""}`;
}

function extractRequisitionScanText(fileBuffer, fileName, mimeType = "") {
  return new Promise((resolve, reject) => {
    if (!scanOcrEnabled) {
      reject(new Error("Scan OCR is disabled on this deployment."));
      return;
    }
    // Cross-platform OCR via Node.js helper
    if (!fs.existsSync(requisitionScanOcrPath)) {
      reject(new Error("Scan OCR helper is unavailable."));
      return;
    }

    const ext = resolveUploadedScanExtension(fileName, mimeType);
    if (!ext) {
      reject(new Error("Unsupported scan format. Upload PDF, PNG, JPG, HEIC, or TIFF."));
      return;
    }

    let tempDir = "";
    try {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-scan-"));
    } catch {
      reject(new Error("Unable to create temporary workspace for scan processing."));
      return;
    }

    const inputPath = path.join(tempDir, sanitizeUploadedScanFileName(fileName, mimeType));
    const cleanup = () => {
      if (!tempDir) return;
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Cleanup is best effort only.
      }
      tempDir = "";
    };

    try {
      fs.writeFileSync(inputPath, fileBuffer);
    } catch {
      cleanup();
      reject(new Error("Unable to write temporary scan file."));
      return;
    }

    const child = spawn(process.execPath, [requisitionScanOcrPath, inputPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (error, payload = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      if (error) reject(error);
      else resolve(payload);
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // No-op.
      }
      finish(new Error("Scan OCR timed out. Try a smaller or clearer scan."));
    }, 60000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      finish(new Error(`Unable to launch scan OCR helper: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        const details = (stderr || stdout || "").trim();
        finish(new Error(details || `Scan OCR helper failed with exit code ${code}.`));
        return;
      }

      try {
        const payload = JSON.parse(stdout || "{}");
        if (!String(payload?.text || "").trim()) {
          finish(new Error("No readable text was found in the uploaded scan."));
          return;
        }
        finish(null, {
          text: String(payload.text || ""),
          lines: Array.isArray(payload.lines) ? payload.lines : [],
          pageCount: Number(payload.pageCount) || 1,
        });
      } catch (error) {
        finish(new Error(`Unable to parse OCR output. ${error.message}`));
      }
    });
  });
}

function normalizeRequisitionScanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRequisitionScanLookup(value) {
  return normalizeRequisitionScanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitRequisitionScanLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => normalizeRequisitionScanText(line))
    .filter(Boolean);
}

const requisitionScanFieldLabels = {
  referenceLab: ["Reference Lab"],
  facilityName: ["Facility", "Facility Name"],
  provider: ["Provider", "Provider Name", "Ordering Provider"],
  providerNpi: ["Provider NPI", "NPI", "National Provider Identifier"],
  firstName: ["First Name"],
  middleName: ["Middle Name"],
  lastName: ["Last Name"],
  suffix: ["Suffix"],
  patientFullName: ["Patient Name", "Patient Full Name", "Full Name"],
  dob: ["Patient DOB", "Date Of Birth", "DOB", "Birth Date"],
  sex: ["Sex", "Gender"],
  mrn: ["Patient ID (MRN)", "MRN", "Medical Record Number", "Patient ID"],
  phone: ["Contact Number", "Phone Number", "Phone", "Contact No"],
  address: ["Address 1", "Address", "Street Address"],
  address2: ["Address 2", "Apartment", "Suite"],
  city: ["City"],
  state: ["State"],
  zipcode: ["Zip Code", "ZIP Code", "ZIP", "Zip"],
  county: ["County"],
  country: ["Country"],
  email: ["Email", "Email Address"],
  ethnicity: ["Ethnicity"],
  race: ["Race"],
  collectionDate: ["Date Of Collection", "Collection Date"],
  collectionTime: ["Time Of Collection", "Collection Time"],
  receivedDate: ["Date Received", "Received Date"],
  additionalInformation: ["Additional Information", "Additional specimen details", "Specimen Notes", "Notes"],
  primaryInsurance: ["Primary Insurance Provider", "Primary Insurance"],
  primaryMemberPolicy: ["Primary Policy ID", "Primary Policy Number", "Primary Member Policy"],
  primaryGroup: ["Primary Group ID", "Primary Group Number"],
  insurancePhone: ["Insurance Phone #", "Insurance Phone"],
  secondaryInsurance: ["Secondary Insurance"],
  secondaryMemberPolicy: ["Secondary Policy ID", "Secondary Member Policy"],
  tertiaryInsurance: ["Tertiary Insurance"],
  tertiaryMemberPolicy: ["Tertiary Policy ID", "Tertiary Member Policy"],
  workersCompensation: ["Workers Compensation"],
  workersMemberPolicy: ["Member Policy", "Workers Member Policy"],
  compensationManager: ["Compensation Manager"],
  injuryDate: ["Injury Date"],
  specimenTypeWoundLocation: ["Wound Location"],
  specimenTypeOtherText: ["Specify Others", "Other Specimen Type"],
  phoneBelongsTo: ["Phone Belongs To"],
};

const requisitionScanKnownLabels = new Set(
  Object.values(requisitionScanFieldLabels)
    .flat()
    .map((label) => normalizeRequisitionScanLookup(label))
);

const requisitionScanKnownLabelStrings = Object.values(requisitionScanFieldLabels)
  .flat()
  .map((label) => String(label).toLowerCase());

function escapeRegexPattern(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimValueBeforeKnownLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lowered = raw.toLowerCase();
  let nextCut = raw.length;
  requisitionScanKnownLabelStrings.forEach((label) => {
    const index = lowered.indexOf(label);
    if (index > 0 && index < nextCut) nextCut = index;
  });
  return normalizeRequisitionScanText(raw.slice(0, nextCut).replace(/[:\-–|]+$/g, ""));
}

function looksLikeRequisitionScanLabel(value) {
  return requisitionScanKnownLabels.has(normalizeRequisitionScanLookup(value));
}

function isRequisitionScanPlaceholder(value) {
  const normalized = normalizeRequisitionScanLookup(value);
  if (!normalized) return true;
  if (looksLikeRequisitionScanLabel(value)) return true;
  if (normalized.startsWith("select ")) return true;
  if (normalized.startsWith("enter ")) return true;
  return (
    normalized === "dd mm yyyy" ||
    normalized === "mm dd yyyy" ||
    normalized === "hh mm" ||
    normalized === "provider npi" ||
    normalized === "additional specimen details" ||
    normalized === "zip code"
  );
}

function extractInlineLabeledValue(line, labels) {
  const source = String(line || "").trim();
  if (!source) return "";

  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\s+)${escapeRegexPattern(label)}\\s*(?:[:\\-]|\\s)\\s*(.+)$`, "i");
    const match = source.match(pattern);
    if (match?.[1]) {
      const candidate = trimValueBeforeKnownLabel(match[1]);
      if (!isRequisitionScanPlaceholder(candidate)) return candidate;
    }

    const normalizedLine = normalizeRequisitionScanLookup(source);
    const normalizedLabel = normalizeRequisitionScanLookup(label);
    if (normalizedLine.startsWith(`${normalizedLabel} `)) {
      const candidate = trimValueBeforeKnownLabel(normalizedLine.slice(normalizedLabel.length));
      if (!isRequisitionScanPlaceholder(candidate)) return candidate;
    }
  }

  return "";
}

function extractNextLabeledValue(lines, index) {
  for (let cursor = index + 1; cursor < Math.min(lines.length, index + 5); cursor += 1) {
    const candidate = trimValueBeforeKnownLabel(lines[cursor]);
    if (!candidate || isRequisitionScanPlaceholder(candidate)) continue;
    return candidate;
  }
  return "";
}

function extractRequisitionScanValue(lines, labels) {
  const normalizedLabels = labels.map((label) => normalizeRequisitionScanLookup(label));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalizedLine = normalizeRequisitionScanLookup(line);
    if (!normalizedLine) continue;

    const inline = extractInlineLabeledValue(line, labels);
    if (inline) return inline;

    if (normalizedLabels.includes(normalizedLine)) {
      const nextLineValue = extractNextLabeledValue(lines, index);
      if (nextLineValue) return nextLineValue;
    }
  }

  return "";
}

function normalizeScanDateValue(value) {
  const raw = normalizeRequisitionScanText(value).replace(/[.]/g, "/");
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const compact = raw.match(/^(\d{8})$/);
  if (compact) {
    const token = compact[1];
    const first = Number(token.slice(0, 2));
    const second = Number(token.slice(2, 4));
    const year = Number(token.slice(4, 8));
    const month = first > 12 && second <= 12 ? second : first;
    const day = first > 12 && second <= 12 ? first : second;
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const match = raw.match(/^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})$/);
  if (!match) return "";

  let year = Number(match[1]);
  let month = Number(match[2]);
  let day = Number(match[3]);

  if (String(match[1]).length === 4) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    year = Number(match[3]);
    const first = Number(match[1]);
    const second = Number(match[2]);
    month = first > 12 && second <= 12 ? second : first;
    day = first > 12 && second <= 12 ? first : second;
  }

  if (!Number.isFinite(year) || year < 1900 || year > 2100) return "";
  if (!Number.isFinite(month) || month < 1 || month > 12) return "";
  if (!Number.isFinite(day) || day < 1 || day > 31) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeScanTimeValue(value) {
  const raw = normalizeRequisitionScanText(value).toLowerCase();
  if (!raw) return "";

  const meridiemMatch = raw.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)$/);
  if (meridiemMatch) {
    let hour = Number(meridiemMatch[1]) % 12;
    const minute = Number(meridiemMatch[2]);
    if (meridiemMatch[3] === "pm") hour += 12;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const clockMatch = raw.match(/^(\d{1,2})[:.](\d{2})$/);
  if (clockMatch) {
    const hour = Number(clockMatch[1]);
    const minute = Number(clockMatch[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  const compact = raw.match(/^(\d{3,4})$/);
  if (compact) {
    const digits = compact[1].padStart(4, "0");
    const hour = Number(digits.slice(0, 2));
    const minute = Number(digits.slice(2, 4));
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  return "";
}

function normalizeScanSex(value) {
  const normalized = normalizeRequisitionScanLookup(value);
  if (!normalized) return "";
  if (normalized === "m" || normalized.includes("male")) return "Male";
  if (normalized === "f" || normalized.includes("female")) return "Female";
  if (normalized.includes("other") || normalized === "o") return "Other";
  return "";
}

function normalizeScanPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length >= 10 ? digits.slice(0, 10) : digits;
}

function normalizeScanZip(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length >= 9) return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
  return digits.slice(0, 5);
}

function normalizeScanState(value) {
  const raw = normalizeRequisitionScanText(value);
  if (!raw) return "";
  return raw.length === 2 ? raw.toUpperCase() : raw;
}

function splitPatientFullName(value) {
  const cleaned = normalizeRequisitionScanText(value).replace(/^patient name[:\s-]*/i, "");
  if (!cleaned) return {};
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0] };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts.at(-1),
  };
}

function findCheckedChoice(text, options) {
  const source = String(text || "");
  for (const option of options) {
    const labels = Array.isArray(option.labels) ? option.labels : [option.label || option.value];
    for (const label of labels) {
      const escapedLabel = escapeRegexPattern(label);
      const patterns = [
        new RegExp(`(?:\\[x\\]|☑|✓|✔|checked)\\s*${escapedLabel}`, "i"),
        new RegExp(`${escapedLabel}\\s*(?:\\[x\\]|☑|✓|✔|checked)`, "i"),
        new RegExp(`\\(x\\)\\s*${escapedLabel}`, "i"),
      ];
      if (patterns.some((pattern) => pattern.test(source))) {
        return option.value;
      }
    }
  }
  return "";
}

function parseRequisitionScanText(text) {
  const lines = splitRequisitionScanLines(text);
  const values = {};
  const matchedFields = [];

  const setValue = (key, value) => {
    const normalized = normalizeRequisitionScanText(value);
    if (!normalized || values[key]) return;
    values[key] = normalized;
    matchedFields.push(key);
  };

  setValue("referenceLab", extractRequisitionScanValue(lines, requisitionScanFieldLabels.referenceLab));
  setValue("facilityName", extractRequisitionScanValue(lines, requisitionScanFieldLabels.facilityName));
  setValue("provider", extractRequisitionScanValue(lines, requisitionScanFieldLabels.provider));

  const providerNpi = String(extractRequisitionScanValue(lines, requisitionScanFieldLabels.providerNpi) || "").replace(/\D/g, "");
  if (providerNpi.length >= 10) setValue("providerNpi", providerNpi.slice(0, 10));

  setValue("firstName", extractRequisitionScanValue(lines, requisitionScanFieldLabels.firstName));
  setValue("middleName", extractRequisitionScanValue(lines, requisitionScanFieldLabels.middleName));
  setValue("lastName", extractRequisitionScanValue(lines, requisitionScanFieldLabels.lastName));
  setValue("suffix", extractRequisitionScanValue(lines, requisitionScanFieldLabels.suffix));

  const fullName = extractRequisitionScanValue(lines, requisitionScanFieldLabels.patientFullName);
  if (fullName) {
    const nameParts = splitPatientFullName(fullName);
    if (nameParts.firstName && !values.firstName) setValue("firstName", nameParts.firstName);
    if (nameParts.middleName && !values.middleName) setValue("middleName", nameParts.middleName);
    if (nameParts.lastName && !values.lastName) setValue("lastName", nameParts.lastName);
  }

  setValue("dob", normalizeScanDateValue(extractRequisitionScanValue(lines, requisitionScanFieldLabels.dob)));
  setValue("sex", normalizeScanSex(extractRequisitionScanValue(lines, requisitionScanFieldLabels.sex)));
  setValue("mrn", extractRequisitionScanValue(lines, requisitionScanFieldLabels.mrn));
  setValue("phone", normalizeScanPhone(extractRequisitionScanValue(lines, requisitionScanFieldLabels.phone)));
  setValue("address", extractRequisitionScanValue(lines, requisitionScanFieldLabels.address));
  setValue("address2", extractRequisitionScanValue(lines, requisitionScanFieldLabels.address2));
  setValue("city", extractRequisitionScanValue(lines, requisitionScanFieldLabels.city));
  setValue("state", normalizeScanState(extractRequisitionScanValue(lines, requisitionScanFieldLabels.state)));
  setValue("zipcode", normalizeScanZip(extractRequisitionScanValue(lines, requisitionScanFieldLabels.zipcode)));
  setValue("county", extractRequisitionScanValue(lines, requisitionScanFieldLabels.county));
  setValue("country", extractRequisitionScanValue(lines, requisitionScanFieldLabels.country));
  setValue("email", extractRequisitionScanValue(lines, requisitionScanFieldLabels.email));
  setValue("ethnicity", extractRequisitionScanValue(lines, requisitionScanFieldLabels.ethnicity));
  setValue("race", extractRequisitionScanValue(lines, requisitionScanFieldLabels.race));

  setValue("collectionDate", normalizeScanDateValue(extractRequisitionScanValue(lines, requisitionScanFieldLabels.collectionDate)));
  setValue("collectionTime", normalizeScanTimeValue(extractRequisitionScanValue(lines, requisitionScanFieldLabels.collectionTime)));
  setValue("receivedDate", normalizeScanDateValue(extractRequisitionScanValue(lines, requisitionScanFieldLabels.receivedDate)));
  setValue("additionalInformation", extractRequisitionScanValue(lines, requisitionScanFieldLabels.additionalInformation));

  setValue("primaryInsurance", extractRequisitionScanValue(lines, requisitionScanFieldLabels.primaryInsurance));
  setValue("primaryMemberPolicy", extractRequisitionScanValue(lines, requisitionScanFieldLabels.primaryMemberPolicy));
  setValue("primaryGroup", extractRequisitionScanValue(lines, requisitionScanFieldLabels.primaryGroup));
  setValue("insurancePhone", normalizeScanPhone(extractRequisitionScanValue(lines, requisitionScanFieldLabels.insurancePhone)));
  setValue("secondaryInsurance", extractRequisitionScanValue(lines, requisitionScanFieldLabels.secondaryInsurance));
  setValue("secondaryMemberPolicy", extractRequisitionScanValue(lines, requisitionScanFieldLabels.secondaryMemberPolicy));
  setValue("tertiaryInsurance", extractRequisitionScanValue(lines, requisitionScanFieldLabels.tertiaryInsurance));
  setValue("tertiaryMemberPolicy", extractRequisitionScanValue(lines, requisitionScanFieldLabels.tertiaryMemberPolicy));
  setValue("workersCompensation", extractRequisitionScanValue(lines, requisitionScanFieldLabels.workersCompensation));
  setValue("workersMemberPolicy", extractRequisitionScanValue(lines, requisitionScanFieldLabels.workersMemberPolicy));
  setValue("compensationManager", extractRequisitionScanValue(lines, requisitionScanFieldLabels.compensationManager));
  setValue("injuryDate", normalizeScanDateValue(extractRequisitionScanValue(lines, requisitionScanFieldLabels.injuryDate)));
  setValue("phoneBelongsTo", extractRequisitionScanValue(lines, requisitionScanFieldLabels.phoneBelongsTo));

  const woundLocation = extractRequisitionScanValue(lines, requisitionScanFieldLabels.specimenTypeWoundLocation);
  const otherSpecimen = extractRequisitionScanValue(lines, requisitionScanFieldLabels.specimenTypeOtherText);
  if (woundLocation) {
    setValue("specimenTypeWound", "Wound");
    setValue("specimenTypeWoundLocation", woundLocation);
  }
  if (otherSpecimen) {
    setValue("specimenTypeOther", "Others");
    setValue("specimenTypeOtherText", otherSpecimen);
  }

  const specimenChoice = findCheckedChoice(text, [
    { value: "specimenTypeSwab", labels: ["Swab"] },
    { value: "specimenTypeWound", labels: ["Wound"] },
    { value: "specimenTypeOther", labels: ["Others", "Other"] },
  ]);
  if (specimenChoice === "specimenTypeSwab") setValue("specimenTypeSwab", "Swab");
  if (specimenChoice === "specimenTypeWound" && !values.specimenTypeWound) setValue("specimenTypeWound", "Wound");
  if (specimenChoice === "specimenTypeOther" && !values.specimenTypeOther) setValue("specimenTypeOther", "Others");

  const billingType = findCheckedChoice(text, [
    { value: "selfPay", labels: ["Self Pay"] },
    { value: "commercial", labels: ["Commercial"] },
    { value: "medicare", labels: ["Medicare"] },
    { value: "medicaid", labels: ["Medicaid"] },
    { value: "workersComp", labels: ["Workers Comp", "Workers Compensation"] },
    { value: "clientBill", labels: ["Client Bill"] },
    { value: "uninsured", labels: ["Uninsured"] },
  ]);
  if (billingType) setValue("billingType", billingType);

  if (!values.email) {
    const emailMatch = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch?.[0]) setValue("email", emailMatch[0]);
  }

  if (!values.country && (values.address || values.city || values.state || values.zipcode)) {
    setValue("country", "United States of America");
  }

  // --- Enhanced Fallbacks for Tesseract tabular skew ---
  if (!values.dob) {
    const rawMatch = text.match(/(?:dob|date of birth|birth|d\.o\.b\.?)[\s:|-]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{8})/i);
    if (rawMatch) setValue("dob", normalizeScanDateValue(rawMatch[1]));
  }

  if (!values.firstName && !values.lastName) {
    const nameMatch = text.match(/(?:patient(?:\s*'?s)?\s*name|name\s*:|patient\s*:)\s*([A-Za-z]+(?:\s+[A-Za-z]+){1,2})/i);
    if (nameMatch) {
      const parts = splitPatientFullName(nameMatch[1]);
      if (parts.firstName && !values.firstName) setValue("firstName", parts.firstName);
      if (parts.lastName && !values.lastName) setValue("lastName", parts.lastName);
    }
  }

  return {
    values,
    matchedFields,
  };
}

function renderReportPdfFromHtml(htmlMarkup) {
  return new Promise((resolve, reject) => {
    if (!reportPdfEnabled) {
      reject(new Error("Report PDF rendering is disabled on this deployment."));
      return;
    }
    let tempDir = "";
    try {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-report-"));
    } catch {
      reject(new Error("Unable to create temporary workspace for report generation."));
      return;
    }

    const htmlPath = path.join(tempDir, "report.html");
    const pdfPath = path.join(tempDir, "report.pdf");
    const cleanup = () => {
      if (!tempDir) return;
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Cleanup best effort only.
      }
      tempDir = "";
    };

    const finish = (error, pdfBuffer = null) => {
      cleanup();
      if (error) reject(error);
      else resolve(pdfBuffer);
    };

    try {
      fs.writeFileSync(htmlPath, htmlMarkup, "utf8");
    } catch {
      finish(new Error("Unable to write temporary report template."));
      return;
    }

    const runProcessRenderer = (command, args, timeoutMs = 45000) =>
      new Promise((resolveRenderer, rejectRenderer) => {
        const child = spawn(command, args, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        let settled = false;

        const done = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) rejectRenderer(error);
          else resolveRenderer();
        };

        const timer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // No-op.
          }
          done(new Error("Report PDF generation timed out."));
        }, timeoutMs);

        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString("utf8");
        });

        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString("utf8");
        });

        child.on("error", (error) => {
          done(new Error(`Unable to launch PDF renderer: ${error.message}`));
        });

        child.on("close", (code) => {
          if (code !== 0) {
            const details = (stderr || stdout || "").trim();
            done(new Error(details || `PDF renderer failed with exit code ${code}.`));
            return;
          }
          done(null);
        });
      });

    const resolveHeadlessBrowserPath = () => {
      const envPath = String(process.env.LABCENTER_PDF_BROWSER || "").trim();
      const commandExists = (command) => {
        if (!command) return false;
        const lookupCommand = process.platform === "win32" ? "where" : "which";
        try {
          const result = spawnSync(lookupCommand, [command], { stdio: "ignore" });
          return result.status === 0;
        } catch {
          return false;
        }
      };
      if (envPath) {
        if ((envPath.includes(path.sep) || process.platform === "win32") && fs.existsSync(envPath)) return envPath;
        if (commandExists(envPath)) return envPath;
      }

      const candidates = process.platform === "win32"
        ? [
            "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
            "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          ]
        : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          ]
        : ["microsoft-edge", "google-chrome", "chromium", "chromium-browser"];

      for (const candidate of candidates) {
        if (candidate.includes(path.sep)) {
          if (fs.existsSync(candidate)) return candidate;
        } else {
          if (commandExists(candidate)) return candidate;
        }
      }
      return "";
    };

    const runSwiftRenderer = async () => {
      if (!fs.existsSync(reportPdfRendererPath)) {
        throw new Error("Swift PDF renderer script is unavailable.");
      }
      await runProcessRenderer("swift", [reportPdfRendererPath, htmlPath, pdfPath]);
    };

    const runHeadlessBrowserRenderer = async () => {
      const browserBinary = resolveHeadlessBrowserPath();
      if (!browserBinary) {
        throw new Error("No compatible headless browser was found for PDF rendering.");
      }
      const htmlUrl = pathToFileURL(htmlPath).toString();
      const args = [
        "--headless=new",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--allow-file-access-from-files",
        `--print-to-pdf=${pdfPath}`,
        htmlUrl,
      ];
      await runProcessRenderer(browserBinary, args);
    };

    const attempts = process.platform === "darwin"
      ? [
          { name: "swift", run: runSwiftRenderer },
          { name: "headless-browser", run: runHeadlessBrowserRenderer },
        ]
      : [
          { name: "headless-browser", run: runHeadlessBrowserRenderer },
          { name: "swift", run: runSwiftRenderer },
        ];

    (async () => {
      const errors = [];
      for (const attempt of attempts) {
        try {
          await attempt.run();
          const pdfBuffer = fs.readFileSync(pdfPath);
          if (!pdfBuffer?.length) throw new Error("Renderer completed but produced an empty file.");
          finish(null, pdfBuffer);
          return;
        } catch (error) {
          errors.push(`${attempt.name}: ${error?.message || "render failed"}`);
        }
      }
      finish(new Error(errors.join(" | ") || "Unable to generate report PDF."));
    })();
  });
}

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    features: {
      reportPdfEnabled,
      scanOcrEnabled,
    },
  });
});

app.use("/api", apiLimiter);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    features: {
      reportPdfEnabled,
      scanOcrEnabled,
    },
  });
});

app.get("/api/auth/csrf-token", (req, res) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomToken();
  }
  res.json({ csrfToken: req.session.csrfToken });
});

function requireCsrf(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();

  const provided = req.get("x-csrf-token");
  const expected = req.session.csrfToken;
  if (!provided || !expected || provided !== expected) {
    auditLog(req, "csrf_check", "denied");
    return res.status(403).json({ error: "Invalid CSRF token." });
  }

  next();
}

app.use("/api", requireCsrf);

app.get("/api/auth/config", (_req, res) => {
  return res.json({
    adminAuthMode: OIDC_ENABLED ? "oidc" : "local",
    oidcLoginUrl: OIDC_ENABLED ? "/auth/oidc/login" : null,
  });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ authenticated: false });
  }

  res.json({ authenticated: true, user: req.session.user });
});

app.get("/auth/oidc/login", async (req, res) => {
  if (!OIDC_ENABLED) {
    return res.redirect(buildOidcErrorRedirect(req, "LabCenter Cloud ID is not configured for this environment."));
  }

  if (req.session.user) {
    return res.redirect("/");
  }

  try {
    const discovery = await getOidcDiscovery();
    const state = randomBase64Url(32);
    const nonce = randomBase64Url(32);
    const codeVerifier = randomBase64Url(64);
    const authorizationUrl = new URL(discovery.authorization_endpoint);

    req.session.oidc = {
      state,
      nonce,
      codeVerifier,
      requestedAt: Date.now(),
    };

    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", OIDC_CLIENT_ID);
    authorizationUrl.searchParams.set("redirect_uri", getOidcRedirectUri(req));
    authorizationUrl.searchParams.set("scope", OIDC_SCOPE);
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("nonce", nonce);
    authorizationUrl.searchParams.set("code_challenge", toCodeChallenge(codeVerifier));
    authorizationUrl.searchParams.set("code_challenge_method", "S256");

    await saveSessionAsync(req);

    auditLog(req, "oidc_login", "redirect", { issuer: discovery.issuer || OIDC_ISSUER });
    return res.redirect(authorizationUrl.toString());
  } catch (error) {
    auditLog(req, "oidc_login", "failed", { reason: error?.message || "unknown_error" });
    return res.redirect(buildOidcErrorRedirect(req, "Unable to start LabCenter Cloud ID sign-in."));
  }
});

app.get("/auth/oidc/callback", async (req, res) => {
  if (!OIDC_ENABLED) {
    return res.redirect(buildOidcErrorRedirect(req, "LabCenter Cloud ID is not configured for this environment."));
  }

  const providerError = String(req.query?.error || "").trim();
  const providerErrorDescription = String(req.query?.error_description || "").trim();
  const code = String(req.query?.code || "").trim();
  const returnedState = String(req.query?.state || "").trim();
  const pendingOidc = req.session?.oidc;

  if (providerError) {
    delete req.session.oidc;
    await saveSessionAsync(req).catch(() => {});
    auditLog(req, "oidc_callback", "failed", {
      reason: providerError,
      detail: providerErrorDescription,
    });
    return res.redirect(
      buildOidcErrorRedirect(req, providerErrorDescription || "LabCenter Cloud ID sign-in was cancelled or denied.")
    );
  }

  if (!pendingOidc?.state || !pendingOidc?.nonce || !pendingOidc?.codeVerifier) {
    auditLog(req, "oidc_callback", "failed", { reason: "missing_pending_session" });
    return res.redirect(buildOidcErrorRedirect(req, "Your sign-in session expired. Please try again."));
  }

  if (!code || !returnedState || returnedState !== pendingOidc.state) {
    delete req.session.oidc;
    await saveSessionAsync(req).catch(() => {});
    auditLog(req, "oidc_callback", "failed", { reason: "invalid_state" });
    return res.redirect(buildOidcErrorRedirect(req, "We could not verify your sign-in request. Please try again."));
  }

  if (Date.now() - Number(pendingOidc.requestedAt || 0) > OIDC_AUTH_TIMEOUT_MS) {
    delete req.session.oidc;
    await saveSessionAsync(req).catch(() => {});
    auditLog(req, "oidc_callback", "failed", { reason: "request_expired" });
    return res.redirect(buildOidcErrorRedirect(req, "Your sign-in session expired. Please try again."));
  }

  try {
    const discovery = await getOidcDiscovery();
    const tokenRequestBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getOidcRedirectUri(req),
      client_id: OIDC_CLIENT_ID,
      code_verifier: String(pendingOidc.codeVerifier),
    });

    if (OIDC_CLIENT_SECRET) {
      tokenRequestBody.set("client_secret", OIDC_CLIENT_SECRET);
    }

    const tokenResponse = await fetchJsonWithTimeout(discovery.token_endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: tokenRequestBody.toString(),
    });

    if (!tokenResponse.id_token) {
      throw new Error("The identity provider did not return an ID token.");
    }

    const claims = await validateOidcIdToken(tokenResponse.id_token, pendingOidc.nonce, discovery);
    const oidcRoles = extractOidcRoles(claims);

    if (OIDC_REQUIRED_ROLE && !oidcRoles.includes(OIDC_REQUIRED_ROLE)) {
      const accessError = new Error("Your account is not assigned LabCenter admin access.");
      accessError.userMessage = "Your account is not assigned LabCenter admin access.";
      throw accessError;
    }

    const displayName = getOidcDisplayName(claims);
    const email = String(claims.email || "").trim().toLowerCase();
    const username = String(claims.preferred_username || email || claims.sub || "").trim();
    const user = {
      id: String(claims.sub || username || email || randomBase64Url(16)),
      email,
      username,
      role: "doctor",
      displayName,
      authProvider: "oidc",
      oidcIssuer: String(discovery.issuer || OIDC_ISSUER),
      oidcRoles,
    };

    await regenerateSessionAsync(req);
    req.session.user = user;
    req.session.csrfToken = randomToken();
    req.session.oidc = {
      issuer: String(discovery.issuer || OIDC_ISSUER),
      idToken: String(tokenResponse.id_token),
      sid: String(claims.sid || ""),
      username,
    };
    await saveSessionAsync(req);

    auditLog(req, "oidc_callback", "success", {
      userId: user.id,
      email: user.email,
      username: user.username,
      roles: oidcRoles,
    });
    return res.redirect("/");
  } catch (error) {
    delete req.session.oidc;
    await saveSessionAsync(req).catch(() => {});
    auditLog(req, "oidc_callback", "failed", { reason: error?.message || "unknown_error" });
    return res.redirect(
      buildOidcErrorRedirect(req, error?.userMessage || "Unable to complete LabCenter Cloud ID sign-in.")
    );
  }
});

app.post("/api/auth/login", loginLimiter, (req, res) => {
  if (OIDC_ENABLED) {
    return res.status(409).json({ error: "Admin login uses LabCenter Cloud ID. Continue with SSO instead." });
  }

  const identifier = String(req.body?.identifier || req.body?.username || req.body?.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || "");
  const ip = getClientIp(req);

  if (!identifier || !password) {
    auditLog(req, "login", "failed", { reason: "missing_fields", identifier });
    return res.status(400).json({ error: "Username and password are required." });
  }

  const key = lockKey(identifier, ip);
  const lockoutMs = getLockoutRemaining(key);
  if (lockoutMs > 0) {
    auditLog(req, "login", "blocked", { reason: "lockout", identifier });
    return res.status(429).json({
      error: `Account temporarily locked. Try again in ${Math.ceil(lockoutMs / 60000)} minutes.`,
    });
  }

  const user = loadUsers().find((item) => {
    const email = String(item?.email || "").trim().toLowerCase();
    const username = String(item?.username || item?.id || "").trim().toLowerCase();
    return identifier === email || (username && identifier === username);
  });
  const validPassword = user ? verifyPassword(password, user.passwordHash) : false;

  if (!user || !validPassword) {
    registerFailure(key);
    auditLog(req, "login", "failed", { reason: "invalid_credentials", identifier });
    return res.status(401).json({ error: "Invalid credentials." });
  }

  req.session.regenerate((err) => {
    if (err) {
      auditLog(req, "login", "failed", { reason: "session_regenerate_error", identifier });
      return res.status(500).json({ error: "Unable to create session." });
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      username: user.username || user.id || user.email,
      role: user.role,
      displayName: user.displayName,
      authProvider: "local",
    };
    req.session.csrfToken = randomToken();
    clearFailures(key);

    auditLog(req, "login", "success", { identifier, userId: user.id, role: user.role });
    return res.json({ authenticated: true, user: req.session.user, csrfToken: req.session.csrfToken });
  });
});

app.post("/api/auth/logout", async (req, res) => {
  if (!req.session.user) {
    return res.status(204).end();
  }

  const { user } = req.session;
  let logoutUrl = "";

  if (user.authProvider === "oidc" && OIDC_ENABLED) {
    try {
      const discovery = await getOidcDiscovery();
      logoutUrl = buildOidcLogoutUrl(req, discovery, req.session.oidc);
    } catch (error) {
      auditLog(req, "oidc_logout", "failed", { reason: error?.message || "unknown_error" });
    }
  }

  auditLog(req, "logout", "success", { userId: user.id, email: user.email, role: user.role });

  try {
    await destroySessionAsync(req);
    res.clearCookie("labcenter.sid", {
      httpOnly: true,
      sameSite: OIDC_ENABLED ? "lax" : "strict",
      secure: isProd,
    });
    if (logoutUrl) {
      return res.json({ loggedOut: true, logoutUrl });
    }
    return res.status(204).end();
  } catch {
    return res.status(500).json({ error: "Unable to logout cleanly." });
  }
});

app.get("/api/client-auth/me", (req, res) => {
  if (!req.session.clientUser) {
    return res.status(401).json({ authenticated: false });
  }
  return res.json({ authenticated: true, clientUser: req.session.clientUser });
});

app.post("/api/client-auth/login", loginLimiter, (req, res) => {
  const username = normalizePortalUsername(req.body?.username);
  const password = String(req.body?.password || "");
  const ip = getClientIp(req);

  if (!username || !password) {
    auditLog(req, "client_login", "failed", { reason: "missing_fields", username });
    return res.status(400).json({ error: "Username and password are required." });
  }

  const key = lockKey(`client:${username}`, ip);
  const lockoutMs = getLockoutRemaining(key);
  if (lockoutMs > 0) {
    auditLog(req, "client_login", "blocked", { reason: "lockout", username });
    return res.status(429).json({
      error: `Account temporarily locked. Try again in ${Math.ceil(lockoutMs / 60000)} minutes.`,
    });
  }

  const facilityData = loadFacilityData();
  const account = facilityData.accounts.find(
    (item) => normalizePortalUsername(item?.portal?.username || item?.portal_username) === username
  );
  const provider = facilityData.providers.find(
    (item) => normalizePortalUsername(item?.portal?.username || item?.portal_username) === username
  );
  const entity = account
    ? { type: "account", record: account }
    : provider
    ? { type: "provider", record: provider }
    : null;
  const record = entity?.record || null;
  const portal = record
    ? {
        username: normalizePortalUsername(record?.portal?.username || record?.portal_username || ""),
        accessType:
          record?.portal?.accessType ||
          record?.portal_access ||
          record?.login_access?.accessType ||
          record?.provider_login_access?.accessType ||
          "no_login",
        passwordHash: record?.portal?.passwordHash || record?.portal_password_hash || "",
        defaultLanguage:
          record?.portal?.defaultLanguage ||
          record?.portal_default_language ||
          record?.login_access?.defaultLanguage ||
          record?.provider_login_access?.defaultLanguage ||
          "English",
        privileges:
          record?.portal?.privileges ||
          record?.login_access?.privileges ||
          record?.provider_login_access?.privileges ||
          {},
      }
    : null;

  if (!portal || !isPortalAccessEnabled(portal.accessType) || !verifyPassword(password, portal.passwordHash)) {
    registerFailure(key);
    auditLog(req, "client_login", "failed", { reason: "invalid_credentials", username });
    return res.status(401).json({ error: "Invalid client portal credentials." });
  }

  req.session.regenerate((err) => {
    if (err) {
      auditLog(req, "client_login", "failed", { reason: "session_regenerate_error", username });
      return res.status(500).json({ error: "Unable to create session." });
    }

    req.session.clientUser = {
      username: portal.username || username,
      entityType: entity.type,
      accountId: String(record?.id || record?.provider_id || ""),
      accountName: String(record?.name || record?.validator_name || ""),
      accessType: portal.accessType,
      privileges: portal.privileges || {},
      defaultLanguage: portal.defaultLanguage || "English",
    };
    req.session.csrfToken = randomToken();
    clearFailures(key);

    auditLog(req, "client_login", "success", {
      username,
      accountId: String(record?.id || record?.provider_id || ""),
      accessType: portal.accessType,
      entityType: entity.type,
    });

    return res.json({
      authenticated: true,
      clientUser: req.session.clientUser,
      csrfToken: req.session.csrfToken,
    });
  });
});

app.post("/api/client-auth/logout", (req, res) => {
  if (!req.session.clientUser) {
    return res.status(204).end();
  }

  const { clientUser } = req.session;
  auditLog(req, "client_logout", "success", {
    username: clientUser.username,
    accountId: clientUser.accountId,
    accessType: clientUser.accessType,
  });

  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Unable to logout cleanly." });
    res.clearCookie("labcenter.sid");
    return res.status(204).end();
  });
});

app.get("/api/portal/data", requireAuthenticatedUser, (req, res) => {
  try {
    return res.json(getPortalDataForSession(req));
  } catch (error) {
    auditLog(req, "portal_data_load", "failed", {
      reason: error?.message || "unexpected_error",
    });
    return res.status(500).json({ error: "Unable to load portal data." });
  }
});

app.post("/api/portal/import-local", requireDoctorAuth, (req, res) => {
  try {
    const payload = {
      registrations: Array.isArray(req.body?.registrations) ? req.body.registrations : [],
      orders: Array.isArray(req.body?.orders) ? req.body.orders : [],
      uploadResultsLog: Array.isArray(req.body?.uploadResultsLog) ? req.body.uploadResultsLog : [],
    };
    const imported = portalStore.importLocalData(payload);
    auditLog(req, "portal_local_import", "success", imported);
    return res.json({
      imported,
      ...getPortalDataForSession(req),
    });
  } catch (error) {
    auditLog(req, "portal_local_import", "failed", {
      reason: error?.message || "unexpected_error",
    });
    return res.status(500).json({ error: "Unable to import existing browser data." });
  }
});

app.post("/api/portal/order-ids", requireAuthenticatedUser, (req, res) => {
  if (!hasRequisitionAccess(req)) {
    return res.status(401).json({ error: "Order creation access is not enabled for this account." });
  }

  try {
    const requestedCount = Number(req.body?.count || 0);
    const count = Math.max(1, Math.min(100, Math.floor(requestedCount || 1)));
    const orderIds = portalStore.reserveOrderIds({
      count,
      startAt: orderIdStartNumber,
      padLength: orderIdPadLength,
    });
    auditLog(req, "order_id_reserve", "success", { count });
    return res.json({ orderIds });
  } catch (error) {
    auditLog(req, "order_id_reserve", "failed", {
      reason: error?.message || "unexpected_error",
    });
    return res.status(500).json({ error: "Unable to reserve order IDs." });
  }
});

app.post("/api/portal/registrations", requireAuthenticatedUser, (req, res) => {
  if (!hasRequisitionAccess(req)) {
    return res.status(401).json({ error: "Registration access is not enabled for this account." });
  }

  try {
    const registration = req.body?.registration && typeof req.body.registration === "object" ? req.body.registration : null;
    if (!registration) {
      return res.status(400).json({ error: "Registration payload is required." });
    }

    const saved = portalStore.upsertRegistration({
      ...registration,
      createdAt: registration.createdAt || new Date().toISOString(),
    });

    auditLog(req, "registration_save", "success", {
      patientId: saved.patientId || "",
    });
    return res.json({
      registration: saved,
      totalCount: portalStore.countRegistrations(),
    });
  } catch (error) {
    auditLog(req, "registration_save", "failed", {
      reason: error?.message || "unexpected_error",
    });
    return res.status(500).json({ error: "Unable to save registration." });
  }
});

app.post("/api/portal/orders/bulk", requireAuthenticatedUser, (req, res) => {
  if (!hasRequisitionAccess(req)) {
    return res.status(401).json({ error: "Order creation access is not enabled for this account." });
  }

  try {
    const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
    if (!orders.length) {
      return res.status(400).json({ error: "One or more orders are required." });
    }
    const nowIso = new Date().toISOString();
    const savedOrders = portalStore.upsertOrders(orders.map((order) => ({
      ...order,
      createdAt: order?.createdAt || nowIso,
      updatedAt: order?.updatedAt || nowIso,
    })));
    auditLog(req, "orders_bulk_save", "success", {
      count: savedOrders.length,
    });
    return res.json({ orders: savedOrders });
  } catch (error) {
    auditLog(req, "orders_bulk_save", "failed", {
      reason: error?.message || "unexpected_error",
    });
    return res.status(500).json({ error: "Unable to save orders." });
  }
});

app.put("/api/portal/orders/:orderId", requireAuthenticatedUser, (req, res) => {
  try {
    const current = portalStore.getOrderById(req.params.orderId);
    if (!current) {
      return res.status(404).json({ error: "Order not found." });
    }
    if (!canAccessOrderRecord(req, current)) {
      return res.status(404).json({ error: "Order not found." });
    }

    const order = req.body?.order && typeof req.body.order === "object" ? req.body.order : null;
    if (!order) {
      return res.status(400).json({ error: "Order payload is required." });
    }

    const nowIso = new Date().toISOString();
    const saved = portalStore.upsertOrders([
      {
        ...current,
        ...order,
        orderId: String(req.params.orderId || current.orderId || "").trim(),
        createdAt: order?.createdAt || current.createdAt || nowIso,
        updatedAt: nowIso,
      },
    ])[0];

    auditLog(req, "order_update", "success", {
      orderId: saved.orderId,
      status: saved.status,
    });
    return res.json({ order: saved });
  } catch (error) {
    auditLog(req, "order_update", "failed", {
      orderId: String(req.params.orderId || ""),
      reason: error?.message || "unexpected_error",
    });
    return res.status(500).json({ error: "Unable to update order." });
  }
});

app.post("/api/pharmd/orders/:orderId/send", requireDoctorAuth, async (req, res) => {
  const orderId = String(req.params.orderId || "").trim();
  const current = portalStore.getOrderById(orderId);
  if (!current || !canAccessOrderRecord(req, current)) {
    return res.status(404).json({ error: "Order not found." });
  }

  const requestedMessage = String(req.body?.oruMessage || current?.pharmd?.oruMessage || "").trim();
  const requestedFileName = sanitizePharmdHl7FileName(
    req.body?.fileName || current?.pharmd?.messageFileName || `Order_${orderId}_PharmD_ORU.hl7`
  );
  const pharmdConfig = getPharmdSftpConfig();
  const publicConfig = getPharmdSftpPublicConfig(pharmdConfig);
  const requestedBy = String(req?.session?.user?.email || req?.session?.user?.displayName || "doctor").trim();
  const requestLog = createPharmdLogEntry("info", "request", `PharmD send requested for ${requestedFileName}.`, {
    requestedBy,
    host: publicConfig.host,
    port: publicConfig.port,
    username: publicConfig.username,
    remoteDir: publicConfig.remoteDir,
  });

  const persistOrder = (patch = {}, extraLogs = []) => {
    const nowIso = new Date().toISOString();
    const existingPharmd = current?.pharmd && typeof current.pharmd === "object" ? current.pharmd : {};
    return portalStore.upsertOrders([
      {
        ...current,
        updatedAt: patch.updatedAt || nowIso,
        pharmd: {
          ...existingPharmd,
          oruMessage: requestedMessage || existingPharmd.oruMessage || "",
          messageFileName: requestedFileName,
          host: publicConfig.host,
          port: publicConfig.port,
          username: publicConfig.username,
          remoteDir: publicConfig.remoteDir,
          lastAttemptAt: patch.lastAttemptAt || nowIso,
          ...patch,
          logs: mergePharmdLogs(existingPharmd.logs, [requestLog, ...extraLogs]),
        },
      },
    ])[0];
  };

  try {
    const result = await executePharmdSftpUpload({
      oruMessage: requestedMessage,
      fileName: requestedFileName,
      config: pharmdConfig,
    });

    const savedOrder = persistOrder({
      status: "sent",
      sendStatus: "sent",
      error: "",
      lastError: "",
      connectionEstablishedAt: result.connectionEstablishedAt,
      sentAt: result.sentAt,
      remotePath: result.remotePath,
      lastAttemptAt: result.sentAt,
      updatedAt: result.sentAt,
    }, result.logs);

    auditLog(req, "pharmd_send", "success", {
      orderId,
      remotePath: result.remotePath,
      host: publicConfig.host,
      username: publicConfig.username,
    });

    return res.json({
      ok: true,
      message: result.message,
      order: savedOrder,
    });
  } catch (error) {
    const failureMessage = String(error?.message || "Unable to send PharmD HL7 file.").trim() || "Unable to send PharmD HL7 file.";
    const failureLogs = Array.isArray(error?.logs) && error.logs.length
      ? error.logs
      : [createPharmdLogEntry("error", "send", failureMessage)];
    const savedOrder = persistOrder({
      status: "error",
      sendStatus: "error",
      error: failureMessage,
      lastError: failureMessage,
      lastAttemptAt: new Date().toISOString(),
    }, failureLogs);

    auditLog(req, "pharmd_send", "failed", {
      orderId,
      reason: failureMessage,
      host: publicConfig.host,
      username: publicConfig.username,
    });

    return res.json({
      ok: false,
      message: failureMessage,
      order: savedOrder,
    });
  }
});

app.post("/api/portal/upload-log", requireAuthenticatedUser, (req, res) => {
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    if (!entries.length) {
      return res.status(400).json({ error: "One or more upload log entries are required." });
    }
    portalStore.appendUploadLogs(entries);
    auditLog(req, "upload_log_append", "success", {
      count: entries.length,
    });
    return res.json(getPortalDataForSession(req));
  } catch (error) {
    auditLog(req, "upload_log_append", "failed", {
      reason: error?.message || "unexpected_error",
    });
    return res.status(500).json({ error: "Unable to save upload activity." });
  }
});

app.get("/api/facility/data", requireAuthenticatedUser, (req, res) => {
  return res.json(getFacilityDataForSession(req));
});

app.post("/api/facility/accounts", requireDoctorAuth, (req, res) => {
  try {
    const basicInfo = req.body?.basicInfo || {};
    const paymentConfigurations = req.body?.paymentConfigurations || {};
    const accountSettings = req.body?.accountSettings || {};
    const loginAccess = req.body?.loginAccess || {};
    const orgHierarchy = req.body?.orgHierarchy || {};

    const accountName = String(basicInfo.accountName || "").trim();
    if (!accountName) {
      return res.status(400).json({ error: "Account Name is required." });
    }

    const accessType = String(loginAccess.accessType || "no_login");
    const portalEnabled = isPortalAccessEnabled(accessType);
    const username = normalizePortalUsername(loginAccess.username || "");
    const password = String(loginAccess.password || "");
    if (portalEnabled) {
      if (!username) return res.status(400).json({ error: "Portal username is required for selected access." });
      if (password.length < 8) return res.status(400).json({ error: "Portal password must be at least 8 characters." });
    }

    const facilityData = loadFacilityData();
    if (portalEnabled) {
      const usernameTakenInAccounts = facilityData.accounts.some(
        (item) => normalizePortalUsername(item?.portal?.username || item?.portal_username || "") === username
      );
      const usernameTakenInProviders = facilityData.providers.some(
        (item) => normalizePortalUsername(item?.portal?.username || item?.portal_username || "") === username
      );
      if (usernameTakenInAccounts || usernameTakenInProviders) {
        return res.status(409).json({ error: "Portal username already exists." });
      }
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const nextId = String(200000 + facilityData.accounts.length + 1);
    const accountCode = String(basicInfo.accountCode || nextId).trim();
    const marketingPerson = String(basicInfo.marketingPerson || "-").trim() || "-";
    const paymentMode = String(paymentConfigurations.paymentMode || "CASH").trim() || "CASH";
    const privileges = loginAccess.privileges && typeof loginAccess.privileges === "object" ? loginAccess.privileges : {};
    const portalContact = String(loginAccess.portalContact || "").trim();
    const passwordHash = portalEnabled ? hashPassword(password) : "";

    const account = {
      srno: String(facilityData.accounts.length + 1),
      name: accountName,
      id: nextId,
      contact: String(basicInfo.contact || "").trim(),
      credit_limit: String(paymentConfigurations.creditLimit || "0"),
      current_due: "0",
      credit_days_remaining: String(paymentConfigurations.creditDays || ""),
      account_code: accountCode,
      email: String(basicInfo.email || "").trim(),
      mailing_address: String(basicInfo.mailingAddress || "-").trim() || "-",
      area: String(basicInfo.area || "").trim(),
      city: String(basicInfo.city || "").trim(),
      state: String(basicInfo.state || "").trim(),
      zipcode: String(basicInfo.zipcode || "").trim(),
      payment_mode: paymentMode,
      source: "Portal",
      org_logins_type: portalEnabled ? "Portal Login" : "No Login",
      logins: portalEnabled ? "1" : "0",
      last_updated_time: nowIso,
      created_time: nowIso,
      exported_time: "",
      marketing_person: marketingPerson,
      notes: String(basicInfo.notes || "-").trim() || "-",
      status: "Active",
      portal_enabled: portalEnabled ? "Yes" : "No",
      portal_access: accessType,
      portal_username: portalEnabled ? username : "",
      portal_default_language: String(loginAccess.defaultLanguage || "English"),
      portal_password_hash: passwordHash,
      portal: portalEnabled
        ? {
            username,
            passwordHash,
            accessType,
            defaultLanguage: String(loginAccess.defaultLanguage || "English"),
            linkExistingAccount: Boolean(loginAccess.linkExistingAccount),
            whatsappEnabled: Boolean(loginAccess.whatsappEnabled),
            portalContact,
            privileges,
            createdAt: nowIso,
          }
        : null,
      basic_information: basicInfo,
      payment_configurations: paymentConfigurations,
      account_settings: accountSettings,
      login_access: {
        accessType,
        defaultLanguage: String(loginAccess.defaultLanguage || "English"),
        portalContact,
        linkExistingAccount: Boolean(loginAccess.linkExistingAccount),
        whatsappEnabled: Boolean(loginAccess.whatsappEnabled),
        privileges,
      },
      org_hierarchy: orgHierarchy,
    };

    facilityData.accounts.unshift(account);
    facilityData.importedAt = facilityData.importedAt || nowIso;
    saveFacilityData(facilityData);

    auditLog(req, "facility_account_create", "success", {
      accountId: account.id,
      accountName: account.name,
      portalEnabled,
      portalAccess: accessType,
    });

    return res.status(201).json({ account });
  } catch (error) {
    auditLog(req, "facility_account_create", "failed", {
      reason: error?.message || "unexpected_error",
    });
    return res.status(500).json({ error: "Unable to create account." });
  }
});

app.put("/api/facility/accounts/:accountId", requireDoctorAuth, (req, res) => {
  try {
    const facilityData = loadFacilityData();
    const accountIndex = resolveAccountIndex(facilityData.accounts, req.params.accountId);
    if (accountIndex < 0) {
      return res.status(404).json({ error: "Account not found." });
    }

    const existing = facilityData.accounts[accountIndex] || {};
    const basicInfo = req.body?.basicInfo || {};
    const paymentConfigurations = req.body?.paymentConfigurations || {};
    const accountSettings = req.body?.accountSettings || {};
    const loginAccess = req.body?.loginAccess || {};
    const orgHierarchy = req.body?.orgHierarchy || {};

    const accountName = String(basicInfo.accountName || existing.name || "").trim();
    if (!accountName) {
      return res.status(400).json({ error: "Account Name is required." });
    }

    const fallbackAccessType =
      existing.login_access?.accessType ||
      existing.portal_access ||
      (existing.portal_enabled === "Yes" ? "report_view" : "no_login");
    const accessType = String(loginAccess.accessType || fallbackAccessType || "no_login");
    const portalEnabled = isPortalAccessEnabled(accessType);
    const username = normalizePortalUsername(
      loginAccess.username || existing.portal_username || existing.portal?.username || ""
    );
    const password = String(loginAccess.password || "");

    if (portalEnabled) {
      if (!username) return res.status(400).json({ error: "Portal username is required for selected access." });
      if (password && password.length < 8) {
        return res.status(400).json({ error: "Portal password must be at least 8 characters." });
      }
    }

    if (portalEnabled) {
      const usernameTakenInAccounts = facilityData.accounts.some(
        (item, idx) =>
          idx !== accountIndex && normalizePortalUsername(item?.portal?.username || item?.portal_username || "") === username
      );
      const usernameTakenInProviders = facilityData.providers.some(
        (item) => normalizePortalUsername(item?.portal?.username || item?.portal_username || "") === username
      );
      if (usernameTakenInAccounts || usernameTakenInProviders) {
        return res.status(409).json({ error: "Portal username already exists." });
      }
    }

    const nowIso = new Date().toISOString();
    const existingPortal = existing.portal && typeof existing.portal === "object" ? existing.portal : null;
    const existingPrivileges =
      existing.login_access?.privileges || existingPortal?.privileges || {};
    const privileges =
      loginAccess.privileges && typeof loginAccess.privileges === "object"
        ? loginAccess.privileges
        : existingPrivileges;
    const defaultLanguage = String(
      loginAccess.defaultLanguage ||
        existing.login_access?.defaultLanguage ||
        existing.portal_default_language ||
        existingPortal?.defaultLanguage ||
        "English"
    );
    const linkExistingAccount =
      "linkExistingAccount" in loginAccess
        ? Boolean(loginAccess.linkExistingAccount)
        : Boolean(existing.login_access?.linkExistingAccount || existingPortal?.linkExistingAccount);
    const whatsappEnabled =
      "whatsappEnabled" in loginAccess
        ? Boolean(loginAccess.whatsappEnabled)
        : Boolean(existing.login_access?.whatsappEnabled || existingPortal?.whatsappEnabled);
    const portalContact = String(
      loginAccess.portalContact ||
        existing.login_access?.portalContact ||
        existingPortal?.portalContact ||
        ""
    ).trim();

    const nextPasswordHash = portalEnabled
      ? password
        ? hashPassword(password)
        : existingPortal?.passwordHash || ""
      : "";
    if (portalEnabled && !nextPasswordHash) {
      return res.status(400).json({ error: "Portal password is required to enable login." });
    }

    const marketingPerson = String(
      basicInfo.marketingPerson || existing.marketing_person || "-"
    ).trim() || "-";
    const paymentMode = String(
      paymentConfigurations.paymentMode || existing.payment_mode || "CASH"
    ).trim() || "CASH";
    const accountId = String(existing.id || "").trim() || String(req.params.accountId || "").trim();
    const accountCode = String(
      basicInfo.accountCode || existing.account_code || accountId
    ).trim() || accountId;

    const updated = {
      ...existing,
      name: accountName,
      id: accountId,
      contact: String(basicInfo.contact || existing.contact || "").trim(),
      credit_limit: String(paymentConfigurations.creditLimit || existing.credit_limit || "0"),
      credit_days_remaining: String(
        paymentConfigurations.creditDays || existing.credit_days_remaining || ""
      ),
      account_code: accountCode,
      email: String(basicInfo.email || existing.email || "").trim(),
      mailing_address: String(
        basicInfo.mailingAddress || existing.mailing_address || "-"
      ).trim() || "-",
      area: String(basicInfo.area || existing.area || "").trim(),
      city: String(basicInfo.city || existing.city || "").trim(),
      state: String(basicInfo.state || existing.state || "").trim(),
      zipcode: String(basicInfo.zipcode || existing.zipcode || "").trim(),
      payment_mode: paymentMode,
      source: existing.source || "Portal",
      org_logins_type: portalEnabled ? "Portal Login" : "No Login",
      logins: portalEnabled ? "1" : "0",
      last_updated_time: nowIso,
      created_time: existing.created_time || nowIso,
      marketing_person: marketingPerson,
      notes: String(basicInfo.notes || existing.notes || "-").trim() || "-",
      status: String(existing.status || "Active"),
      portal_enabled: portalEnabled ? "Yes" : "No",
      portal_access: accessType,
      portal_username: portalEnabled ? username : "",
      portal_default_language: defaultLanguage,
      portal_password_hash: portalEnabled ? nextPasswordHash : "",
      portal: portalEnabled
        ? {
            username,
            passwordHash: nextPasswordHash,
            accessType,
            defaultLanguage,
            linkExistingAccount,
            whatsappEnabled,
            portalContact,
            privileges,
            createdAt: existingPortal?.createdAt || nowIso,
            updatedAt: nowIso,
          }
        : null,
      basic_information: {
        ...(existing.basic_information || {}),
        ...basicInfo,
      },
      payment_configurations: {
        ...(existing.payment_configurations || {}),
        ...paymentConfigurations,
      },
      account_settings: {
        ...(existing.account_settings || {}),
        ...accountSettings,
      },
      login_access: {
        accessType,
        defaultLanguage,
        portalContact,
        linkExistingAccount,
        whatsappEnabled,
        privileges,
      },
      org_hierarchy: {
        ...(existing.org_hierarchy || {}),
        ...orgHierarchy,
      },
    };

    facilityData.accounts[accountIndex] = updated;
    saveFacilityData(facilityData);

    auditLog(req, "facility_account_update", "success", {
      accountId: updated.id,
      accountName: updated.name,
      portalEnabled,
      portalAccess: accessType,
    });

    return res.json({ account: updated });
  } catch (error) {
    auditLog(req, "facility_account_update", "failed", {
      reason: error?.message || "unexpected_error",
    });
    return res.status(500).json({ error: "Unable to update account." });
  }
});

app.post("/api/facility/providers", requireDoctorAuth, (req, res) => {
  try {
    const providerInfo = req.body?.providerInfo || {};
    const configuration = req.body?.configuration || {};
    const signature = req.body?.signature || {};
    const loginAccess = req.body?.loginAccess || {};

    const providerName = String(providerInfo.providerName || "").trim();
    if (!providerName) {
      return res.status(400).json({ error: "Provider Name is required." });
    }

    const accessType = String(loginAccess.accessType || "no_login");
    const portalEnabled = isPortalAccessEnabled(accessType);
    const username = normalizePortalUsername(loginAccess.username || "");
    const password = String(loginAccess.password || "");
    if (portalEnabled) {
      if (!username) return res.status(400).json({ error: "Portal username is required for selected access." });
      if (password.length < 8) return res.status(400).json({ error: "Portal password must be at least 8 characters." });
    }

    const facilityData = loadFacilityData();
    if (portalEnabled) {
      const usernameTakenInAccounts = facilityData.accounts.some(
        (item) => normalizePortalUsername(item?.portal?.username || item?.portal_username || "") === username
      );
      const usernameTakenInProviders = facilityData.providers.some(
        (item) => normalizePortalUsername(item?.portal?.username || item?.portal_username || "") === username
      );
      if (usernameTakenInAccounts || usernameTakenInProviders) {
        return res.status(409).json({ error: "Portal username already exists." });
      }
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const nextId = String(300000 + facilityData.providers.length + 1);
    const designation = String(providerInfo.designation || "").trim();
    const fullProviderName = `${designation} ${providerName}`.replace(/\s+/g, " ").trim();
    const state = String(providerInfo.state || "-").trim() || "-";
    const portalContact = String(loginAccess.portalContact || "").trim();
    const passwordHash = portalEnabled ? hashPassword(password) : "";

    const provider = {
      validator_name: fullProviderName || providerName,
      contact_no: String(providerInfo.contactNo || "").trim(),
      email_id: String(providerInfo.email || "-").trim() || "-",
      price_list: "",
      revenue_list: "-",
      business_source: String(configuration.source || "None (Default)").trim() || "None (Default)",
      state,
      npi: String(providerInfo.npi || "").trim(),
      speciality: String(providerInfo.speciality || "").trim(),
      fax_number: String(providerInfo.faxNumber || "").trim(),
      account: String(configuration.accounts || "").trim(),
      provider_id: nextId,
      provider_name: providerName,
      display_name: String(providerInfo.displayName || providerName).trim(),
      extension: String(providerInfo.extension || "").trim(),
      mailing_address: String(providerInfo.mailingAddress || "-").trim() || "-",
      city: String(providerInfo.city || "").trim(),
      zipcode: String(providerInfo.zipcode || "").trim(),
      alternate_emails: String(providerInfo.alternateEmails || "").trim(),
      comment: String(providerInfo.comment || "").trim(),
      dob_month: String(providerInfo.dobMonth || "").trim(),
      dob_day: String(providerInfo.dobDay || "").trim(),
      dob_year: String(providerInfo.dobYear || "").trim(),
      encrypted_reports_password: String(configuration.encryptedReportsPassword || "").trim(),
      send_email: Boolean(configuration.sendEmail),
      send_fax: Boolean(configuration.sendFax),
      send_whatsapp: Boolean(configuration.sendWhatsapp),
      signature_file_name: String(signature.fileName || "").trim(),
      portal_enabled: portalEnabled ? "Yes" : "No",
      portal_access: accessType,
      portal_username: portalEnabled ? username : "",
      portal_default_language: String(loginAccess.defaultLanguage || "English"),
      portal_password_hash: passwordHash,
      created_time: nowIso,
      last_updated_time: nowIso,
      portal: portalEnabled
        ? {
            username,
            passwordHash,
            accessType,
            defaultLanguage: String(loginAccess.defaultLanguage || "English"),
            linkExistingAccount: Boolean(loginAccess.linkExistingAccount),
            portalContact,
            createdAt: nowIso,
          }
        : null,
      provider_information: providerInfo,
      provider_configuration: configuration,
      provider_signature: signature,
      provider_login_access: {
        accessType,
        defaultLanguage: String(loginAccess.defaultLanguage || "English"),
        portalContact,
        linkExistingAccount: Boolean(loginAccess.linkExistingAccount),
      },
    };

    facilityData.providers.unshift(provider);
    facilityData.importedAt = facilityData.importedAt || nowIso;
    saveFacilityData(facilityData);

    auditLog(req, "facility_provider_create", "success", {
      providerId: provider.provider_id,
      providerName: provider.validator_name,
      portalEnabled,
      portalAccess: accessType,
    });

    return res.status(201).json({ provider });
  } catch (error) {
    auditLog(req, "facility_provider_create", "failed", {
      reason: error?.message || "unexpected_error",
    });
    return res.status(500).json({ error: "Unable to create provider." });
  }
});

app.put("/api/facility/providers/:providerId", requireDoctorAuth, (req, res) => {
  try {
    const facilityData = loadFacilityData();
    const providerIndex = resolveProviderIndex(facilityData.providers, req.params.providerId);
    if (providerIndex < 0) {
      return res.status(404).json({ error: "Provider not found." });
    }

    const existing = facilityData.providers[providerIndex] || {};
    const providerInfo = req.body?.providerInfo || {};
    const configuration = req.body?.configuration || {};
    const signature = req.body?.signature || {};
    const loginAccess = req.body?.loginAccess || {};

    const existingDisplay = parseProviderDisplayName(existing.validator_name || "");
    const providerName = String(
      providerInfo.providerName || existing.provider_name || existingDisplay.providerName || ""
    ).trim();
    if (!providerName) {
      return res.status(400).json({ error: "Provider Name is required." });
    }

    const fallbackAccessType =
      existing.provider_login_access?.accessType ||
      existing.portal_access ||
      (existing.portal_enabled === "Yes" ? "report_view" : "no_login");
    const accessType = String(loginAccess.accessType || fallbackAccessType || "no_login");
    const portalEnabled = isPortalAccessEnabled(accessType);
    const username = normalizePortalUsername(
      loginAccess.username || existing.portal_username || existing.portal?.username || ""
    );
    const password = String(loginAccess.password || "");

    if (portalEnabled) {
      if (!username) return res.status(400).json({ error: "Portal username is required for selected access." });
      if (password && password.length < 8) {
        return res.status(400).json({ error: "Portal password must be at least 8 characters." });
      }
    }

    if (portalEnabled) {
      const usernameTakenInAccounts = facilityData.accounts.some(
        (item) => normalizePortalUsername(item?.portal?.username || item?.portal_username || "") === username
      );
      const usernameTakenInProviders = facilityData.providers.some(
        (item, idx) =>
          idx !== providerIndex && normalizePortalUsername(item?.portal?.username || item?.portal_username || "") === username
      );
      if (usernameTakenInAccounts || usernameTakenInProviders) {
        return res.status(409).json({ error: "Portal username already exists." });
      }
    }

    const nowIso = new Date().toISOString();
    const existingPortal = existing.portal && typeof existing.portal === "object" ? existing.portal : null;
    const defaultLanguage = String(
      loginAccess.defaultLanguage ||
        existing.provider_login_access?.defaultLanguage ||
        existing.portal_default_language ||
        existingPortal?.defaultLanguage ||
        "English"
    );
    const linkExistingAccount =
      "linkExistingAccount" in loginAccess
        ? Boolean(loginAccess.linkExistingAccount)
        : Boolean(existing.provider_login_access?.linkExistingAccount || existingPortal?.linkExistingAccount);
    const portalContact = String(
      loginAccess.portalContact ||
        existing.provider_login_access?.portalContact ||
        existingPortal?.portalContact ||
        ""
    ).trim();
    const nextPasswordHash = portalEnabled
      ? password
        ? hashPassword(password)
        : existingPortal?.passwordHash || ""
      : "";
    if (portalEnabled && !nextPasswordHash) {
      return res.status(400).json({ error: "Portal password is required to enable login." });
    }

    const derivedDesignation = String(
      providerInfo.designation || existing.provider_information?.designation || existingDisplay.designation || ""
    ).trim();
    const designation = derivedDesignation;
    const displayName = String(
      providerInfo.displayName || existing.display_name || existing.provider_name || providerName
    ).trim() || providerName;
    const fullProviderName = `${designation} ${providerName}`.replace(/\s+/g, " ").trim() || providerName;
    const state = String(providerInfo.state || existing.state || "-").trim() || "-";
    const source = String(configuration.source || existing.business_source || "None (Default)").trim() || "None (Default)";
    const accounts = String(configuration.accounts || existing.account || "").trim();
    const encryptedReportsPassword = String(
      configuration.encryptedReportsPassword || existing.encrypted_reports_password || ""
    ).trim();
    const sendEmail =
      "sendEmail" in configuration ? Boolean(configuration.sendEmail) : Boolean(existing.send_email);
    const sendFax = "sendFax" in configuration ? Boolean(configuration.sendFax) : Boolean(existing.send_fax);
    const sendWhatsapp =
      "sendWhatsapp" in configuration ? Boolean(configuration.sendWhatsapp) : Boolean(existing.send_whatsapp);
    const signatureFileName = String(signature.fileName || existing.signature_file_name || "").trim();
    const providerId = String(existing.provider_id || "").trim();

    const updated = {
      ...existing,
      validator_name: fullProviderName || providerName,
      contact_no: String(providerInfo.contactNo || existing.contact_no || "").trim(),
      email_id: String(providerInfo.email || existing.email_id || "-").trim() || "-",
      price_list: String(existing.price_list || ""),
      revenue_list: String(existing.revenue_list || "-") || "-",
      business_source: source,
      state,
      npi: String(providerInfo.npi || existing.npi || "").trim(),
      speciality: String(providerInfo.speciality || existing.speciality || "").trim(),
      fax_number: String(providerInfo.faxNumber || existing.fax_number || "").trim(),
      account: accounts,
      provider_id: providerId || undefined,
      provider_name: providerName,
      display_name: displayName,
      extension: String(providerInfo.extension || existing.extension || "").trim(),
      mailing_address: String(providerInfo.mailingAddress || existing.mailing_address || "-").trim() || "-",
      city: String(providerInfo.city || existing.city || "").trim(),
      zipcode: String(providerInfo.zipcode || existing.zipcode || "").trim(),
      alternate_emails: String(providerInfo.alternateEmails || existing.alternate_emails || "").trim(),
      comment: String(providerInfo.comment || existing.comment || "").trim(),
      dob_month: String(providerInfo.dobMonth || existing.dob_month || "").trim(),
      dob_day: String(providerInfo.dobDay || existing.dob_day || "").trim(),
      dob_year: String(providerInfo.dobYear || existing.dob_year || "").trim(),
      encrypted_reports_password: encryptedReportsPassword,
      send_email: sendEmail,
      send_fax: sendFax,
      send_whatsapp: sendWhatsapp,
      signature_file_name: signatureFileName,
      portal_enabled: portalEnabled ? "Yes" : "No",
      portal_access: accessType,
      portal_username: portalEnabled ? username : "",
      portal_default_language: defaultLanguage,
      portal_password_hash: portalEnabled ? nextPasswordHash : "",
      created_time: existing.created_time || nowIso,
      last_updated_time: nowIso,
      portal: portalEnabled
        ? {
            username,
            passwordHash: nextPasswordHash,
            accessType,
            defaultLanguage,
            linkExistingAccount,
            portalContact,
            createdAt: existingPortal?.createdAt || nowIso,
            updatedAt: nowIso,
          }
        : null,
      provider_information: {
        ...(existing.provider_information || {}),
        ...providerInfo,
        designation,
        providerName,
        displayName,
      },
      provider_configuration: {
        ...(existing.provider_configuration || {}),
        ...configuration,
        source,
        accounts,
        encryptedReportsPassword,
        sendEmail,
        sendFax,
        sendWhatsapp,
      },
      provider_signature: {
        ...(existing.provider_signature || {}),
        ...signature,
        fileName: signatureFileName,
      },
      provider_login_access: {
        accessType,
        defaultLanguage,
        portalContact,
        linkExistingAccount,
      },
    };

    if (!providerId) {
      delete updated.provider_id;
    }

    facilityData.providers[providerIndex] = updated;
    saveFacilityData(facilityData);

    auditLog(req, "facility_provider_update", "success", {
      providerId: updated.provider_id || `idx-${providerIndex}`,
      providerName: updated.validator_name,
      portalEnabled,
      portalAccess: accessType,
    });

    return res.json({ provider: updated });
  } catch (error) {
    auditLog(req, "facility_provider_update", "failed", {
      reason: error?.message || "unexpected_error",
    });
    return res.status(500).json({ error: "Unable to update provider." });
  }
});

app.post("/api/orders/render-report-pdf", async (req, res) => {
  if (!hasReportPdfAccess(req)) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const html = String(req.body?.html || "");
  if (!html.trim()) {
    return res.status(400).json({ error: "Report HTML content is required." });
  }
  if (html.length > 4 * 1024 * 1024) {
    return res.status(413).json({ error: "Report HTML content is too large." });
  }

  const fileName = sanitizeReportPdfFileName(req.body?.fileName || "");
  const orderId = String(req.body?.orderId || "").trim();
  const reportType = String(req.body?.reportType || "final").trim() || "final";
  try {
    const existingOrder = orderId ? portalStore.getOrderById(orderId) : null;
    if (orderId && (!existingOrder || !canAccessOrderRecord(req, existingOrder))) {
      return res.status(404).json({ error: "Order not found." });
    }

    const pdfBuffer = await renderReportPdfFromHtml(html);
    await persistRenderedReportBuffer(req, existingOrder, pdfBuffer, { orderId, fileName, reportType });
    auditLog(req, "render_final_report_pdf", "success", {
      bytes: pdfBuffer.length,
      fileName,
      orderId,
      reportType,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Cache-Control", "no-store");
    return res.send(pdfBuffer);
  } catch (error) {
    auditLog(req, "render_final_report_pdf", "failed", {
      reason: error?.message || "render_error",
    });
    const reason = String(error?.message || "").trim();
    return res.status(500).json({
      error: reason ? `Unable to generate final report PDF. ${reason}` : "Unable to generate final report PDF.",
    });
  }
});

app.post("/api/orders/publish-final-report", async (req, res) => {
  if (!hasReportPdfAccess(req)) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const orderId = String(req.body?.orderId || "").trim();
  const html = String(req.body?.html || "");
  const fileName = sanitizeReportPdfFileName(req.body?.fileName || `Order_${orderId || Date.now()}_Final_Report.pdf`);
  if (!orderId) {
    return res.status(400).json({ error: "Order ID is required." });
  }
  if (!html.trim()) {
    return res.status(400).json({ error: "Final report HTML content is required." });
  }
  if (html.length > 4 * 1024 * 1024) {
    return res.status(413).json({ error: "Final report HTML content is too large." });
  }

  try {
    const existingOrder = portalStore.getOrderById(orderId);
    if (!existingOrder || !canAccessOrderRecord(req, existingOrder)) {
      return res.status(404).json({ error: "Order not found." });
    }

    const provider = resolveProviderForOrderPublish(existingOrder);
    if (!provider) {
      return res.status(400).json({ error: "Unable to find a matching provider with publish settings for this order." });
    }

    const providerName = String(
      provider?.validator_name || provider?.provider_name || provider?.display_name || provider?.provider_information?.providerName || existingOrder.provider || ""
    ).trim();
    const targets = getProviderPublishTargets(provider);
    const email = {
      enabled: targets.sendEmail,
      recipients: targets.emailRecipients,
      mode: publishEmailMode,
      status: !targets.sendEmail
        ? "disabled"
        : !targets.emailRecipients.length
        ? "missing_recipient"
        : publishEmailMode === "disabled"
        ? "not_configured"
        : publishEmailMode === "log"
        ? "logged"
        : "simulated",
    };
    const fax = {
      enabled: targets.sendFax,
      recipient: targets.faxRecipient,
      mode: publishFaxMode,
      status: !targets.sendFax
        ? "disabled"
        : !targets.faxRecipient
        ? "missing_recipient"
        : publishFaxMode === "disabled"
        ? "not_configured"
        : publishFaxMode === "log"
        ? "logged"
        : "simulated",
    };

    const successfulChannels = [email.status, fax.status].filter((status) => status === "logged" || status === "simulated");
    if (!successfulChannels.length) {
      const reasons = [];
      if (email.enabled && !email.recipients.length) reasons.push("email recipient is missing");
      if (fax.enabled && !fax.recipient) reasons.push("fax number is missing");
      if (email.enabled && email.recipients.length && email.status === "not_configured") reasons.push("email delivery is not configured");
      if (fax.enabled && fax.recipient && fax.status === "not_configured") reasons.push("fax delivery is not configured");
      if (!email.enabled && !fax.enabled) reasons.push("provider publish settings do not enable email or fax");
      return res.status(400).json({
        error: `Unable to publish final report: ${reasons.filter(Boolean).join("; ")}.`,
        email,
        fax,
      });
    }

    const pdfBuffer = await renderReportPdfFromHtml(html);
    await persistRenderedReportBuffer(req, existingOrder, pdfBuffer, { orderId, fileName, reportType: "final" });

    const publishedAt = new Date().toISOString();
    const savedOrder = portalStore.upsertOrders([
      {
        ...existingOrder,
        publishedReports: {
          ...(existingOrder.publishedReports || {}),
          final: {
            publishedAt,
            providerName,
            email: {
              status: email.status,
              recipients: email.recipients,
              mode: email.mode,
            },
            fax: {
              status: fax.status,
              recipient: fax.recipient,
              mode: fax.mode,
            },
            fileName,
          },
        },
        updatedAt: publishedAt,
      },
    ])[0];

    auditLog(req, "publish_final_report", "success", {
      orderId,
      providerName,
      emailStatus: email.status,
      faxStatus: fax.status,
      fileName,
    });

    return res.json({
      message: `Publish completed for Order #${orderId} to ${providerName || "provider"}.`,
      email,
      fax,
      order: savedOrder,
    });
  } catch (error) {
    auditLog(req, "publish_final_report", "failed", {
      orderId,
      reason: error?.message || "unexpected_error",
    });
    return res.status(500).json({
      error: error?.message || "Unable to publish final report.",
    });
  }
});

app.post("/api/orders/process-raw", async (req, res) => {
  if (!hasRequisitionAccess(req)) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const fileName = String(req.body?.fileName || "").trim();
    const contentBase64 = String(req.body?.contentBase64 || "").trim();
    const panelName = String(req.body?.panelName || "Lab Panel").trim() || "Lab Panel";
    const expectedSampleId = String(req.body?.expectedSampleId || "").trim();
    const orderId = String(req.body?.orderId || "").trim();
    const existingOrder = orderId ? portalStore.getOrderById(orderId) : null;

    if (!fileName || !contentBase64) {
      return res.status(400).json({ error: "fileName and contentBase64 are required." });
    }
    if (orderId && (!existingOrder || !canAccessOrderRecord(req, existingOrder))) {
      return res.status(404).json({ error: "Order not found." });
    }

    const fileBuffer = Buffer.from(contentBase64, "base64");
    if (!fileBuffer.length) return res.status(400).json({ error: "Uploaded file is empty or invalid." });
    if (fileBuffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large. Maximum size is 5MB." });
    }

    const report = filterReportBySample(parseLabWorkbook(fileBuffer, panelName), expectedSampleId);
    if (expectedSampleId && !report.summary.totalRows) {
      return res.status(400).json({
        error: `No records matched Sample ID "${expectedSampleId}" in the uploaded file.`,
      });
    }
    const processedAt = new Date().toISOString();
    let rawFile = null;
    if (shouldUseS3ForRequest(req)) {
      rawFile = await s3Storage.uploadBuffer({
        key: buildStoredFileKey("uploads", "raw", orderId || expectedSampleId || "unassigned", `${processedAt}-${fileName}`),
        body: fileBuffer,
        contentType: inferMimeTypeFromFileName(fileName),
        metadata: {
          orderid: orderId,
          expectedsampleid: expectedSampleId,
          panelname: panelName,
          filename: fileName,
        },
      });
      portalStore.saveOrderFile({
        orderId,
        fileRole: "raw_result_upload",
        reportType: panelName,
        bucket: rawFile.bucket,
        key: rawFile.key,
        fileName,
        mimeType: inferMimeTypeFromFileName(fileName),
        sizeBytes: rawFile.sizeBytes,
        createdAt: processedAt,
        metadata: {
          expectedSampleId,
          panelName,
        },
      });
    }
    auditLog(req, "process_raw_lab_excel", "success", {
      fileName,
      bytes: fileBuffer.length,
      detected: report.summary.detectedCount,
      rows: report.summary.totalRows,
      expectedSampleId: expectedSampleId || null,
      orderId: orderId || null,
    });
    return res.json({
      fileName,
      processedAt,
      report,
      rawFile,
    });
  } catch (error) {
    auditLog(req, "process_raw_lab_excel", "failed", {
      reason: error?.message || "parse_error",
    });
    return res.status(400).json({ error: error?.message || "Unable to parse excel workbook." });
  }
});

app.post("/api/requisitions/extract-scan", async (req, res) => {
  if (!hasRequisitionAccess(req)) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const fileName = String(req.body?.fileName || "").trim();
    const mimeType = String(req.body?.mimeType || "").trim();
    const contentBase64 = String(req.body?.contentBase64 || "").trim();

    if (!fileName || !contentBase64) {
      return res.status(400).json({ error: "fileName and contentBase64 are required." });
    }

    const fileExtension = resolveUploadedScanExtension(fileName, mimeType);
    if (!fileExtension) {
      return res.status(415).json({ error: "Unsupported scan format. Upload PDF, PNG, JPG, HEIC, or TIFF." });
    }

    const fileBuffer = Buffer.from(contentBase64, "base64");
    if (!fileBuffer.length) {
      return res.status(400).json({ error: "Uploaded scan is empty or invalid." });
    }
    if (fileBuffer.length > 8 * 1024 * 1024) {
      return res.status(413).json({ error: "Scan too large. Maximum size is 8MB." });
    }

    const extraction = await extractRequisitionScanData(fileBuffer, fileName, mimeType);

    auditLog(req, "extract_requisition_scan", "success", {
      fileName,
      bytes: fileBuffer.length,
      pageCount: extraction.pageCount,
      matchedFields: extraction.matchedFields.length,
      engine: extraction.engine,
    });

    return res.json({
      fileName,
      processedAt: new Date().toISOString(),
      pageCount: extraction.pageCount,
      values: extraction.values,
      matchedFields: extraction.matchedFields,
      engine: extraction.engine,
      message: extraction.matchedFields.length
        ? `Extracted ${extraction.matchedFields.length} form field${extraction.matchedFields.length === 1 ? "" : "s"}.`
        : "No recognizable requisition fields were found in the scan.",
    });
  } catch (error) {
    auditLog(req, "extract_requisition_scan", "failed", {
      reason: error?.message || "scan_processing_error",
    });
    return res.status(400).json({
      error: error?.message || "Unable to read the uploaded scan.",
    });
  }
});

app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/vendor/ag-grid", express.static(path.join(__dirname, "node_modules", "ag-grid-community")));

app.get("/data/us-zips.json", (_req, res) => {
  return res.sendFile(zipCodesPath);
});

function sendClientFile(res, filePath) {
  if (!isProd) {
    res.setHeader("Cache-Control", "no-store");
  }
  return res.sendFile(filePath);
}

app.get(["/", "/index.html"], (_req, res) => {
  return sendClientFile(res, path.join(__dirname, "index.html"));
});

app.get("/app.js", (_req, res) => {
  return sendClientFile(res, path.join(__dirname, "app.js"));
});

app.get("/styles.css", (_req, res) => {
  return sendClientFile(res, path.join(__dirname, "styles.css"));
});

app.listen(PORT, () => {
  console.log(`LabCenter secure portal running at http://localhost:${PORT}`);
  console.log(`[runtime] Data directory: ${dataDir}`);
  console.log(`[runtime] Session directory: ${sessionDir}`);
});
