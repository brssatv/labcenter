const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { spawn } = require("child_process");
const { Client: Ssh2Client } = require("ssh2");

const express = require("express");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { registerAdminSettingsRoutes } = require("./server/features/admin-settings");
const { registerAuthRoutes } = require("./server/features/authentication");
const { normalizeAllFacilities, registerBillingManagementRoutes } = require("./server/features/billing-management");
const { registerFacilityRoutes } = require("./server/features/facility-management");
const {
  applyReceiptMatch,
  applyReceiptMiss,
  hasReceivedReceipt,
  initializeReceiptTracking,
  isEligibleForReceiptChecks,
  listReceiptCandidates,
  normalizeReceiptConfig,
  resolveNextReceiptDueAt,
  resolveReceiptState,
} = require("./server/features/pharmd-receipts");
const { registerPortalWorkflowRoutes } = require("./server/features/portal-workflow");
const { registerReportPublishingRoutes } = require("./server/features/report-publishing");
const { DEFAULT_APP_TIME_ZONE } = require("./lib/app-time-zone");
const { createAppSettingsStore } = require("./lib/app-settings-store");
const { createPortalStore } = require("./lib/portal-store");
const { buildPatientProfileArtifacts } = require("./lib/patient-profile");
const { createS3Storage, sanitizeS3PathSegment } = require("./lib/s3-storage");
const { extractRequisitionScanData } = require("./lib/requisition-scan");
require("dotenv").config();

const app = express();
const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT || 3000);
const HOST = String(process.env.HOST || (isProd ? "0.0.0.0" : "127.0.0.1")).trim() || (isProd ? "0.0.0.0" : "127.0.0.1");
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-only-change-me";
const SESSION_TTL_MS = 60 * 60 * 1000;
const SESSION_WARNING_MS = 2 * 60 * 1000;
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
const defaultSessionDir = isProd
  ? path.join(dataDir, "sessions")
  : path.join(process.env.LOCALAPPDATA || os.tmpdir(), "LabCenter", "sessions");
const sessionDir = resolveRuntimePath(process.env.SESSION_DIR, defaultSessionDir);
const usersPath = path.join(dataDir, "users.json");
const billersPath = path.join(dataDir, "billers.json");
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
  if (!raw || raw === "disabled" || raw === "off") return "disabled";
  if (raw === "live" || raw === "enabled" || raw === "enable" || raw === "send" || raw === "on") return "live";
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
const SRFAX_ENDPOINT = String(process.env.SRFAX_ENDPOINT || "https://www.srfax.com/SRF_SecWebSvc.php").trim()
  || "https://www.srfax.com/SRF_SecWebSvc.php";
const SRFAX_ACCESS_ID = String(process.env.SRFAX_ACCESS_ID || "").trim();
const SRFAX_ACCESS_PWD = String(process.env.SRFAX_ACCESS_PWD || "").trim();
const SRFAX_SENDER_EMAIL = String(process.env.SRFAX_SENDER_EMAIL || "").trim().toLowerCase();
const PUBLISH_FAX_SENDER_DIGITS = "3525654554";
const PUBLISH_FAX_RECEIVER_DIGITS = "13525654554";
const PUBLISH_FAX_DISPLAY_NUMBER = "352-565-4554";
const PUBLISH_FAX_TIMEOUT_MS = Math.max(5000, Math.min(120000, Math.floor(Number(process.env.SRFAX_TIMEOUT_MS || 30000) || 30000)));
const publishEmailMode = normalizePublishMode(process.env.LABCENTER_PUBLISH_EMAIL_MODE || "disabled");
const SENDGRID_API_KEY = String(process.env.SENDGRID_API_KEY || "").trim();
const PUBLISH_EMAIL_SENDER = String(process.env.PUBLISH_EMAIL_SENDER || "vitalbeingauto@gmail.com").trim().toLowerCase();
const PUBLISH_EMAIL_RECIPIENT = String(process.env.PUBLISH_EMAIL_RECIPIENT || "mrittunjai@innovexlab.com").trim().toLowerCase();
const publishFaxMode = normalizePublishMode(
  process.env.LABCENTER_PUBLISH_FAX_MODE || (SRFAX_ACCESS_ID && SRFAX_ACCESS_PWD ? "live" : "disabled")
);
const PHARMD_SFTP_HOST = String(process.env.PHARMD_SFTP_HOST || "18.144.129.54").trim();
const PHARMD_SFTP_PORT = Math.max(1, Math.floor(Number(process.env.PHARMD_SFTP_PORT || 22) || 22));
const PHARMD_SFTP_USERNAME = String(process.env.PHARMD_SFTP_USERNAME || "jays-user").trim();
const PHARMD_SFTP_PASSWORD = String(process.env.PHARMD_SFTP_PASSWORD || "").trim();
const PHARMD_SFTP_ORU_DIR = String(process.env.PHARMD_SFTP_ORU_DIR || "oru").trim() || "oru";
const PHARMD_SFTP_PDF_DIR = String(process.env.PHARMD_SFTP_PDF_DIR || "pharmd-pdf2").trim() || "pharmd-pdf2";
const PHARMD_SFTP_TIMEOUT_SEC = Math.max(5, Math.min(120, Math.floor(Number(process.env.PHARMD_SFTP_TIMEOUT_SEC || 30) || 30)));
const PHARMD_SFTP_RECEIPT_INTERVAL_SEC = Math.max(
  60,
  Math.min(
    86400,
    Math.floor(
      Number(process.env.PHARMD_SFTP_RECEIPT_INTERVAL_SEC || process.env.PHARMD_SFTP_POLL_INTERVAL_SEC || 1200) || 1200
    )
  )
);
const PHARMD_SFTP_RECEIPT_MAX_CHECKS = Math.max(
  1,
  Math.min(100, Math.floor(Number(process.env.PHARMD_SFTP_RECEIPT_MAX_CHECKS || 5) || 5))
);

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
    billersPath,
    path.join(sourceDataDir, "billers.json"),
    `${JSON.stringify({ billers: [] }, null, 2)}\n`
  );
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

const appSettingsStore = createAppSettingsStore({
  dataDir,
  defaultTimeZone: DEFAULT_APP_TIME_ZONE,
});
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
      ttl: Math.ceil(SESSION_TTL_MS / 1000),
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
      maxAge: SESSION_TTL_MS,
    },
  })
);

const apiLimiter = rateLimit({
  windowMs: SESSION_TTL_MS,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: SESSION_TTL_MS,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});

const failedLoginAttempts = new Map();
const FAIL_WINDOW_MS = SESSION_TTL_MS;
const LOCKOUT_MS = 30 * 60 * 1000;
const FAIL_LIMIT = 5;

function loadUsers() {
  return loadUsersFromPath(usersPath);
}

function loadBillers() {
  try {
    const parsed = JSON.parse(fs.readFileSync(billersPath, "utf8"));
    return Array.isArray(parsed?.billers) ? parsed.billers : [];
  } catch {
    return [];
  }
}

function saveBillers(billers) {
  fs.writeFileSync(billersPath, `${JSON.stringify({ billers }, null, 2)}\n`, "utf8");
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

function hasAuthenticatedSession(req) {
  return Boolean(req?.session?.user || req?.session?.clientUser || req?.session?.billerUser);
}

function resolveSessionExpiresAt(req) {
  const expires = req?.session?.cookie?.expires;
  const expiresAt = expires ? new Date(expires).getTime() : Number.NaN;
  if (Number.isFinite(expiresAt)) return expiresAt;

  const maxAge = Number(req?.session?.cookie?.maxAge);
  if (Number.isFinite(maxAge) && maxAge >= 0) {
    return Date.now() + maxAge;
  }

  return Date.now() + SESSION_TTL_MS;
}

function buildSessionStatePayload(req) {
  const expiresAtMs = resolveSessionExpiresAt(req);
  return {
    timeoutMs: SESSION_TTL_MS,
    warningMs: SESSION_WARNING_MS,
    remainingMs: Math.max(0, expiresAtMs - Date.now()),
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
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

function readAuditLogEntries(limit = 200) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  if (!fs.existsSync(auditPath)) return [];

  return fs
    .readFileSync(auditPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-safeLimit)
    .reverse()
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
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

function requireBillingAuth(req, res, next) {
  if (!req.session.billerUser) {
    return res.status(401).json({ error: "Billing authentication required." });
  }
  const billerId = String(req.session.billerUser.id || "");
  const biller = loadBillers().find((item) => String(item?.id || "") === billerId);
  if (!biller || String(biller.status || "active").trim().toLowerCase() !== "active") {
    delete req.session.billerUser;
    return res.status(401).json({ error: "Billing access is inactive." });
  }
  req.session.billerUser.allFacilities = normalizeAllFacilities(biller.allFacilities);
  req.session.billerUser.facilityIds = Array.isArray(biller.facilityIds) ? biller.facilityIds.map(String) : [];
  next();
}

function requireReportViewerAuth(req, res, next) {
  if (req.session.user || req.session.clientUser) return next();
  return requireBillingAuth(req, res, next);
}

function requireRequisitionPrintAuth(req, res, next) {
  if (req.session.user) return next();
  return requireBillingAuth(req, res, next);
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

  const billerUser = req?.session?.billerUser;
  if (billerUser) {
    const biller = loadBillers().find((item) => String(item?.id || "") === String(billerUser.id || ""));
    if (!biller || String(biller.status || "active").trim().toLowerCase() !== "active") {
      return { accounts: [], providers: [] };
    }

    const allFacilities = normalizeAllFacilities(biller.allFacilities);
    const assignedKeys = new Set(
      (Array.isArray(biller.facilityIds) ? biller.facilityIds : [])
        .map(normalizeMatchKey)
        .filter(Boolean)
    );
    const matchingAccounts = allFacilities
      ? facilityData.accounts
      : facilityData.accounts.filter((row) =>
          [row?.id, row?.account_code, row?.name].some((value) => assignedKeys.has(normalizeMatchKey(value)))
        );
    const accountKeys = new Set(
      matchingAccounts
        .flatMap((row) => [row?.id, row?.name, row?.account_code])
        .map(normalizeMatchKey)
        .filter(Boolean)
    );
    const matchingProviders = facilityData.providers.filter((row) =>
      [row?.account, row?.accounts, row?.provider_configuration?.accounts]
        .flatMap((value) => Array.isArray(value) ? value : [value])
        .some((value) => accountKeys.has(normalizeMatchKey(value)))
    );

    return {
      accounts: matchingAccounts.map(sanitizeFacilityRecord),
      providers: matchingProviders.map(sanitizeFacilityRecord),
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
  const isBillingScope = Boolean(req?.session?.billerUser);

  return {
    matchesOrder(order) {
      if (!order) return false;
      const accountMatch = matchAny(
        [order?.facilityId, order?.facilityName, order?.accountId, order?.accountName],
        accountKeys
      );
      if (isBillingScope) return accountMatch;
      return accountMatch || matchAny([order?.provider, order?.providerId], providerKeys);
    },
    matchesRegistration(registration) {
      if (!registration) return false;
      return (
        matchAny([registration?.facilityId, registration?.facilityName, registration?.accountId, registration?.accountName], accountKeys)
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
    timeZone: appSettingsStore.getTimeZone(),
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

function buildLocalReportStorageKey({ reportType, orderId, fileName, generatedAt }) {
  return path.posix.join(
    "generated-reports",
    sanitizeS3PathSegment(reportType || "report"),
    sanitizeS3PathSegment(orderId || "unassigned"),
    sanitizeS3PathSegment(`${generatedAt}-${fileName}`)
  );
}

function resolveLocalReportStoragePath(storageKey) {
  const normalizedKey = String(storageKey || "").trim().replace(/^\/+/, "");
  if (!normalizedKey) return null;
  const absoluteDataDir = path.resolve(dataDir);
  const absolutePath = path.resolve(dataDir, normalizedKey);
  if (absolutePath !== absoluteDataDir && !absolutePath.startsWith(`${absoluteDataDir}${path.sep}`)) {
    return null;
  }
  return absolutePath;
}

function isLocalGeneratedReportRecord(record) {
  return String(record?.storageType || "").trim().toLowerCase() === "local"
    || String(record?.bucket || "").trim().toLowerCase() === "local";
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
  const receiptConfig = normalizeReceiptConfig({
    pdfDir: PHARMD_SFTP_PDF_DIR,
    receiptIntervalSec: PHARMD_SFTP_RECEIPT_INTERVAL_SEC,
    receiptMaxChecks: PHARMD_SFTP_RECEIPT_MAX_CHECKS,
  });
  return {
    host: PHARMD_SFTP_HOST,
    port: PHARMD_SFTP_PORT,
    username: PHARMD_SFTP_USERNAME,
    password: PHARMD_SFTP_PASSWORD,
    remoteDir: PHARMD_SFTP_ORU_DIR,
    pdfDir: receiptConfig.pdfDir,
    timeoutSec: PHARMD_SFTP_TIMEOUT_SEC,
    receiptIntervalSec: receiptConfig.receiptIntervalSec,
    receiptMaxChecks: receiptConfig.receiptMaxChecks,
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

function resolvePharmdAccession(order) {
  return String(order?.accessionNo || order?.accession || "").trim();
}

function hasPendingPharmdReceipt(order) {
  return Boolean(isEligibleForReceiptChecks(order) && !hasReceivedReceipt(order?.pharmd));
}

function createPharmdTimeoutError(message) {
  const error = new Error(message);
  error.code = "ETIMEDOUT";
  return error;
}

function runPharmdSftpWithTimeout(taskFactory, timeoutMs, timeoutMessage, onTimeout = () => {}) {
  let settled = false;
  let timer = null;
  return new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        onTimeout();
      } catch {
        // Best-effort cleanup only.
      }
      reject(createPharmdTimeoutError(timeoutMessage));
    }, Math.max(1000, timeoutMs));

    Promise.resolve()
      .then(taskFactory)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

function connectPharmdSftpClient(connection, password) {
  return new Promise((resolve, reject) => {
    const client = new Ssh2Client();
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      client.removeListener("ready", handleReady);
      client.removeListener("error", handleError);
      client.removeListener("close", handleClose);
      client.removeListener("end", handleEnd);
      if (error) reject(error);
      else resolve(client);
    };

    const handleReady = () => finish(null, client);
    const handleError = (error) => finish(error);
    const handleClose = () => finish(new Error("SFTP session ended before login completed."));
    const handleEnd = () => finish(new Error("SFTP session ended before login completed."));

    client.once("ready", handleReady);
    client.once("error", handleError);
    client.once("close", handleClose);
    client.once("end", handleEnd);

    try {
      client.connect({
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password,
        readyTimeout: Math.max(5000, connection.timeoutSec * 1000),
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
      });
    } catch (error) {
      finish(error);
    }
  });
}

function createPharmdSftpSession(client) {
  return new Promise((resolve, reject) => {
    client.sftp((error, sftp) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(sftp);
    });
  });
}

function listPharmdRemoteDir(sftp, remoteDir) {
  return new Promise((resolve, reject) => {
    sftp.readdir(String(remoteDir || "").trim(), (error, list) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Array.isArray(list) ? list : []);
    });
  });
}

function confirmPharmdRemoteDir(sftp, remoteDir) {
  const target = String(remoteDir || "").trim();
  if (!target) return Promise.resolve();
  return new Promise((resolve, reject) => {
    sftp.opendir(target, (openError, handle) => {
      if (openError) {
        reject(openError);
        return;
      }
      sftp.close(handle, (closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve();
      });
    });
  });
}

function uploadPharmdMessageStream(sftp, remotePath, messageText) {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(remotePath, {
      flags: "w",
      encoding: "utf8",
      autoClose: true,
    });
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    stream.once("error", finish);
    stream.once("close", () => finish(null));

    try {
      stream.end(messageText, "utf8");
    } catch (error) {
      finish(error);
    }
  });
}

function downloadPharmdFileBuffer(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = sftp.createReadStream(remotePath, {
      flags: "r",
      autoClose: true,
    });
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      resolve(Buffer.concat(chunks));
    };

    stream.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });
    stream.once("error", finish);
    stream.once("close", () => finish(null));
  });
}

function buildPharmdSftpFailureMessage(error, { phase, remoteDir } = {}) {
  const rawMessage = String(error?.message || "").trim();
  const code = String(error?.code || "").trim().toUpperCase();

  if (code === "ENOTFOUND" || /could not resolve hostname|getaddrinfo|resolve/i.test(rawMessage)) {
    return "Unable to resolve PharmD SFTP host.";
  }
  if (code === "ECONNREFUSED" || /connection refused/i.test(rawMessage)) {
    return "Connection refused by PharmD SFTP server.";
  }
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH" || /no route to host/i.test(rawMessage)) {
    return "No route to PharmD SFTP host.";
  }
  if (code === "ETIMEDOUT" || /timed out|timeout while waiting for handshake/i.test(rawMessage)) {
    if (phase === "connect") return "Timed out while connecting to PharmD SFTP.";
    if (phase === "remote_dir") return `Timed out while opening remote directory '${remoteDir}'.`;
    if (phase === "upload") return "Timed out while uploading the PharmD HL7 file.";
    if (phase === "download") return "Timed out while downloading the PharmD return file.";
    return "Timed out while sending the PharmD HL7 file.";
  }
  if (/all configured authentication methods failed|authentication failed|permission denied/i.test(rawMessage)) {
    if (phase === "upload") return "Permission denied while uploading the PharmD HL7 file.";
    if (phase === "download") return "Permission denied while downloading the PharmD return file.";
    return "Permission denied while connecting to PharmD SFTP.";
  }
  if (phase === "remote_dir") {
    if (/^Remote directory .* was not found\.$/.test(rawMessage) || /^Unable to enter remote directory /.test(rawMessage)) {
      return rawMessage;
    }
    if (/no such file/i.test(rawMessage)) {
      return `Remote directory '${remoteDir}' was not found.`;
    }
    return `Unable to enter remote directory '${remoteDir}'.`;
  }
  if (phase === "upload") {
    if (/failure|no such file|not found/i.test(rawMessage)) {
      return "Unable to upload the PharmD HL7 file.";
    }
    return rawMessage || "Unable to upload the PharmD HL7 file.";
  }
  if (phase === "download") {
    if (/failure|no such file|not found/i.test(rawMessage)) {
      return "Unable to download the PharmD return file.";
    }
    return rawMessage || "Unable to download the PharmD return file.";
  }
  if (/sftp session ended before login completed/i.test(rawMessage)) {
    return "SFTP session ended before login completed.";
  }
  return rawMessage || "PharmD SFTP upload failed.";
}

function resolvePharmdReceiptFileName(entry) {
  return String(entry?.filename || "").trim();
}

function resolvePharmdReceiptMatch(entries, order) {
  const candidates = [
    {
      key: normalizeMatchKey(resolvePharmdAccession(order)),
      matchedBy: "accession",
    },
    {
      key: normalizeMatchKey(order?.orderId),
      matchedBy: "order_id",
    },
  ].filter((candidate, index, array) => candidate.key && array.findIndex((item) => item.key === candidate.key) === index);

  for (const candidate of candidates) {
    const matches = (Array.isArray(entries) ? entries : [])
      .filter((entry) => normalizeMatchKey(resolvePharmdReceiptFileName(entry)).includes(candidate.key));
    if (!matches.length) continue;
    matches.sort((left, right) => {
      const leftMtime = Number(left?.attrs?.mtime || 0);
      const rightMtime = Number(right?.attrs?.mtime || 0);
      return rightMtime - leftMtime;
    });
    return {
      entry: matches[0],
      matchedBy: candidate.matchedBy,
      matchValue: candidate.key,
    };
  }
  return null;
}

function resolvePharmdReceiptTimestamp(entry) {
  const mtimeSeconds = Number(entry?.attrs?.mtime || 0);
  if (Number.isFinite(mtimeSeconds) && mtimeSeconds > 0) {
    return new Date(mtimeSeconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

async function persistPharmdReceiptBuffer(store, fileBuffer, {
  orderId,
  accession,
  fileName,
  remotePath,
  receivedAt,
} = {}) {
  const createdAt = new Date().toISOString();
  const mimeType = inferMimeTypeFromFileName(fileName) || "application/octet-stream";
  if (s3Storage.enabled) {
    const storedFile = await s3Storage.uploadBuffer({
      key: buildStoredFileKey("pharmd", "receipts", orderId || "unassigned", `${createdAt}-${fileName}`),
      body: fileBuffer,
      contentType: mimeType,
      metadata: {
        orderid: orderId,
        accessionno: accession,
        remotepath: remotePath,
        receivedat: receivedAt,
        filename: fileName,
      },
      contentDisposition: `inline; filename="${fileName}"`,
      cacheControl: "private, max-age=0, no-store",
    });
    store.saveOrderFile({
      orderId,
      fileRole: "pharmd_receipt_file",
      reportType: "pharmdReceipt",
      bucket: storedFile.bucket,
      key: storedFile.key,
      fileName,
      mimeType,
      sizeBytes: storedFile.sizeBytes,
      createdAt,
      metadata: {
        accession,
        remotePath,
        receivedAt,
      },
    });
    return {
      bucket: storedFile.bucket,
      key: storedFile.key,
      fileName,
      mimeType,
      sizeBytes: storedFile.sizeBytes,
      createdAt,
    };
  }

  const localKey = buildStoredFileKey("pharmd-receipts", orderId || "unassigned", `${createdAt}-${fileName}`);
  const localPath = resolveLocalReportStoragePath(localKey);
  if (!localPath) {
    throw new Error("Unable to resolve local PharmD receipt storage path.");
  }
  ensureDir(path.dirname(localPath));
  fs.writeFileSync(localPath, fileBuffer);
  store.saveOrderFile({
    orderId,
    fileRole: "pharmd_receipt_file",
    reportType: "pharmdReceipt",
    bucket: "local",
    key: localKey,
    fileName,
    mimeType,
    sizeBytes: fileBuffer.length,
    createdAt,
    metadata: {
      accession,
      remotePath,
      receivedAt,
      storageType: "local",
    },
  });
  return {
    bucket: "local",
    key: localKey,
    storageType: "local",
    fileName,
    mimeType,
    sizeBytes: fileBuffer.length,
    createdAt,
  };
}

async function pollPharmdReceiptFolderOnce({
  store = portalStore,
  config = getPharmdSftpConfig(),
  logger = console,
  orderIds = null,
  force = false,
  mode = "auto",
} = {}) {
  const connection = getPharmdSftpPublicConfig(config);
  const receiptConfig = normalizeReceiptConfig(config);
  const pdfDir = receiptConfig.pdfDir;
  const password = String(config?.password || "").trim();
  const nowIso = new Date().toISOString();
  const pendingOrders = listReceiptCandidates(store.listOrders(), receiptConfig, {
    orderIds,
    mode,
    nowIso,
    force,
  });
  const summary = {
    checkedOrders: pendingOrders.length,
    matchedOrders: 0,
    exhaustedOrders: 0,
    remoteDir: pdfDir,
    mode,
  };

  if (!pendingOrders.length) return summary;
  if (!connection.host || !connection.port || !connection.username || !password || !pdfDir) {
    const configMessage = "PharmD SFTP host, port, username, password, or receipt folder is not configured.";
    const missingConfigCheckedAt = new Date().toISOString();
    if (mode === "auto") {
      const configUpdates = pendingOrders.map((order) => {
        const current = store.getOrderById(order.orderId) || order;
        const existingPharmd = current?.pharmd && typeof current.pharmd === "object" ? current.pharmd : {};
        const missPatch = applyReceiptMiss(existingPharmd, receiptConfig, {
          checkedAt: missingConfigCheckedAt,
          mode,
          errorMessage: configMessage,
        });
        if (missPatch.receiptPollingStatus === "exhausted") {
          summary.exhaustedOrders += 1;
        }
        return {
          ...current,
          updatedAt: missingConfigCheckedAt,
          pharmd: {
            ...existingPharmd,
            ...missPatch,
            logs: mergePharmdLogs(existingPharmd.logs, [
              createPharmdLogEntry("error", "receipt_check", configMessage, {
                accessionNo: resolvePharmdAccession(current),
                remoteDir: pdfDir,
                mode,
              }),
            ]),
          },
        };
      });
      if (configUpdates.length) {
        store.upsertOrders(configUpdates);
      }
    }
    return {
      ...summary,
      error: configMessage,
    };
  }

  let client = null;
  try {
    client = await connectPharmdSftpClient(connection, password);
    client.on("error", () => {});
    const sftp = await createPharmdSftpSession(client);
    await confirmPharmdRemoteDir(sftp, pdfDir);
    const entries = await listPharmdRemoteDir(sftp, pdfDir);
    const updates = [];
    for (const order of pendingOrders) {
      const accession = resolvePharmdAccession(order);
      const match = resolvePharmdReceiptMatch(entries, order);
      const current = store.getOrderById(order.orderId) || order;
      const existingPharmd = current?.pharmd && typeof current.pharmd === "object" ? current.pharmd : {};
      if (hasReceivedReceipt(existingPharmd)) continue;

      if (!match) {
        const missPatch = applyReceiptMiss(existingPharmd, receiptConfig, {
          checkedAt: nowIso,
          mode,
        });
        if (missPatch.receiptPollingStatus === "exhausted") {
          summary.exhaustedOrders += 1;
        }
        updates.push({
          ...current,
          updatedAt: nowIso,
          pharmd: {
            ...existingPharmd,
            ...missPatch,
            logs: mergePharmdLogs(existingPharmd.logs, [
              createPharmdLogEntry(
                "info",
                "receipt_check",
                missPatch.receiptPollingStatus === "exhausted"
                  ? `No PharmD return file found after ${missPatch.receiptAutoCheckCount} automatic checks.`
                  : "No PharmD return file found yet.",
                {
                  accessionNo: accession,
                  remoteDir: pdfDir,
                  mode,
                  nextCheckAt: missPatch.receiptNextCheckAt || "",
                }
              ),
            ]),
          },
        });
        continue;
      }

      const fileName = resolvePharmdReceiptFileName(match.entry);
      const receivedAt = resolvePharmdReceiptTimestamp(match.entry);
      const remotePath = buildPharmdRemotePath(pdfDir, fileName);
      try {
        const fileBuffer = await downloadPharmdFileBuffer(sftp, remotePath);
        const storedFile = await persistPharmdReceiptBuffer(store, fileBuffer, {
          orderId: current.orderId,
          accession,
          fileName,
          remotePath,
          receivedAt,
        });
        const matchPatch = applyReceiptMatch(existingPharmd, receiptConfig, {
          checkedAt: nowIso,
          receivedAt,
          fileName,
          remotePath,
          accession,
          matchedBy: match.matchedBy,
          storedFile: {
            ...storedFile,
            remotePath,
            receivedAt,
            accession,
          },
          source: mode === "manual" ? "pharmd_sftp_manual_check" : "pharmd_sftp_poll",
          mode,
        });
        updates.push({
          ...current,
          updatedAt: nowIso,
          pharmd: {
            ...existingPharmd,
            ...matchPatch,
            logs: mergePharmdLogs(existingPharmd.logs, [
            createPharmdLogEntry("success", "receive", `PharmD return file stored: ${fileName}.`, {
                accessionNo: accession,
                matchedBy: match.matchedBy,
                remotePath,
                receivedAt,
                storageKey: storedFile.key,
                storageBucket: storedFile.bucket,
              }),
            ]),
          },
        });
        summary.matchedOrders += 1;
      } catch (error) {
        const failureMessage = buildPharmdSftpFailureMessage(error, {
          phase: "download",
          remoteDir: pdfDir,
        });
        const missPatch = applyReceiptMiss(existingPharmd, receiptConfig, {
          checkedAt: nowIso,
          mode,
          errorMessage: failureMessage,
        });
        if (missPatch.receiptPollingStatus === "exhausted") {
          summary.exhaustedOrders += 1;
        }
        updates.push({
          ...current,
          updatedAt: nowIso,
          pharmd: {
            ...existingPharmd,
            ...missPatch,
            logs: mergePharmdLogs(existingPharmd.logs, [
              createPharmdLogEntry("error", "receipt_check", failureMessage, {
                accessionNo: accession,
                remotePath,
                mode,
              }),
            ]),
          },
        });
      }
    }

    if (updates.length) {
      store.upsertOrders(updates);
    }
    return summary;
  } catch (error) {
    const message = buildPharmdSftpFailureMessage(error, {
      phase: "remote_dir",
      remoteDir: pdfDir,
    });
    const failureCheckedAt = new Date().toISOString();
    const failureUpdates = pendingOrders.map((order) => {
      const current = store.getOrderById(order.orderId) || order;
      const existingPharmd = current?.pharmd && typeof current.pharmd === "object" ? current.pharmd : {};
      const missPatch = applyReceiptMiss(existingPharmd, receiptConfig, {
        checkedAt: failureCheckedAt,
        mode,
        errorMessage: message,
      });
      if (missPatch.receiptPollingStatus === "exhausted") {
        summary.exhaustedOrders += 1;
      }
      return {
        ...current,
        updatedAt: failureCheckedAt,
        pharmd: {
          ...existingPharmd,
          ...missPatch,
          logs: mergePharmdLogs(existingPharmd.logs, [
            createPharmdLogEntry("error", "receipt_check", message, {
              accessionNo: resolvePharmdAccession(current),
              remoteDir: pdfDir,
              mode,
            }),
          ]),
        },
      };
    });
    if (failureUpdates.length) {
      store.upsertOrders(failureUpdates);
    }
    logger?.warn?.(`[pharmd] Receipt poll failed: ${message}`);
    return {
      ...summary,
      error: message,
    };
  } finally {
    if (client) {
      try {
        client.end();
      } catch {
        // Best-effort cleanup only.
      }
    }
  }
}

function executePharmdSftpUpload({ oruMessage, fileName, config }) {
  return new Promise((resolve, reject) => {
    const messageText = String(oruMessage || "");
    const safeFileName = sanitizePharmdHl7FileName(fileName);
    const connection = getPharmdSftpPublicConfig(config);
    const logs = [
      createPharmdLogEntry("info", "prepare", `Preparing PharmD ORU upload for ${safeFileName}.`, {
        host: connection.host,
        port: connection.port,
        username: connection.username,
        remoteDir: connection.remoteDir,
        transport: "ssh2",
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

    const remotePath = buildPharmdRemotePath(connection.remoteDir, safeFileName);
    const timeoutMs = Math.max(10000, (connection.timeoutSec + 15) * 1000);
    const markerLogs = [];
    let client = null;
    let connectedAt = "";
    let uploadedAt = "";
    let currentPhase = "connect";

    const closeClient = () => {
      if (!client) return;
      try {
        client.end();
      } catch {
        // Best-effort cleanup only.
      }
    };

    runPharmdSftpWithTimeout(async () => {
      client = await connectPharmdSftpClient(connection, String(config.password || ""));
      client.on("error", () => {});
      connectedAt = new Date().toISOString();
      markerLogs.push(createPharmdLogEntry("success", "connect", "Connection to PharmD SFTP established successfully."));

      const sftp = await createPharmdSftpSession(client);

      if (connection.remoteDir) {
        currentPhase = "remote_dir";
        try {
          await confirmPharmdRemoteDir(sftp, connection.remoteDir);
        } catch (error) {
          const message = buildPharmdSftpFailureMessage(error, {
            phase: "remote_dir",
            remoteDir: connection.remoteDir,
          });
          throw Object.assign(new Error(message), { cause: error, pharmdPhase: "remote_dir" });
        }
        markerLogs.push(createPharmdLogEntry("success", "remote_dir", `Remote PharmD folder confirmed: ${connection.remoteDir}.`));
      }

      currentPhase = "upload";
      try {
        await uploadPharmdMessageStream(sftp, remotePath, messageText);
      } catch (error) {
        const message = buildPharmdSftpFailureMessage(error, {
          phase: "upload",
          remoteDir: connection.remoteDir,
        });
        throw Object.assign(new Error(message), { cause: error, pharmdPhase: "upload" });
      }

      uploadedAt = new Date().toISOString();
      currentPhase = "complete";
      markerLogs.push(createPharmdLogEntry("success", "upload", `HL7 file uploaded successfully to PharmD as ${safeFileName}.`));
    }, timeoutMs, "Timed out while sending the PharmD HL7 file.", closeClient)
      .then(() => {
        closeClient();
        markerLogs.push(createPharmdLogEntry("info", "complete", "PharmD SFTP session closed cleanly."));
        resolve({
          message: `PharmD HL7 file uploaded successfully to ${remotePath}.`,
          logs: [...logs, ...markerLogs],
          connectionEstablishedAt: connectedAt || new Date().toISOString(),
          sentAt: uploadedAt || new Date().toISOString(),
          remotePath,
          fileName: safeFileName,
        });
      })
      .catch((error) => {
        closeClient();
        const message = buildPharmdSftpFailureMessage(error, {
          phase: String(error?.pharmdPhase || currentPhase || (connectedAt ? "upload" : "connect")).trim() || "connect",
          remoteDir: connection.remoteDir,
        });
        reject({
          message,
          logs: [...logs, ...markerLogs, createPharmdLogEntry("error", "complete", message)],
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

function resolveFacilityFaxForOrderPublish(order) {
  const facilityData = loadFacilityData();
  const accounts = Array.isArray(facilityData?.accounts) ? facilityData.accounts : [];
  const matchKeys = new Set(
    [order?.accountId, order?.accountName, order?.facilityId, order?.facilityName]
      .map(normalizeMatchKey)
      .filter(Boolean)
  );
  const account = accounts.find((row) =>
    [row?.id, row?.name, row?.account_code, row?.facility_name, row?.facilityName, row?.basic_information?.accountName]
      .map(normalizeMatchKey)
      .some((value) => value && matchKeys.has(value))
  );
  return normalizeFaxRecipient(
    account?.fax_number || account?.faxNumber || account?.basic_information?.faxNumber
  );
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

registerAuthRoutes({
  app,
  dependencies: {
    OIDC_AUTH_TIMEOUT_MS,
    OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET,
    OIDC_ENABLED,
    OIDC_ISSUER,
    OIDC_REQUIRED_ROLE,
    OIDC_SCOPE,
    SESSION_TTL_MS,
    auditLog,
    buildOidcErrorRedirect,
    buildOidcLogoutUrl,
    buildSessionStatePayload,
    clearFailures,
    destroySessionAsync,
    extractOidcRoles,
    fetchJsonWithTimeout,
    getClientIp,
    getLockoutRemaining,
    getOidcDiscovery,
    getOidcDisplayName,
    getOidcRedirectUri,
    hasAuthenticatedSession,
    isPortalAccessEnabled,
    isProd,
    loadBillers,
    loadFacilityData,
    loadUsers,
    lockKey,
    loginLimiter,
    normalizePortalUsername,
    normalizeAllFacilities,
    randomBase64Url,
    randomToken,
    regenerateSessionAsync,
    registerFailure,
    getAppTimeZone: () => appSettingsStore.getTimeZone(),
    saveSessionAsync,
    toCodeChallenge,
    validateOidcIdToken,
    verifyPassword,
  },
});

registerBillingManagementRoutes({
  app,
  dependencies: {
    auditLog,
    canAccessOrderRecord,
    createId: () => crypto.randomUUID(),
    getAppTimeZone: () => appSettingsStore.getTimeZone(),
    hashPassword,
    loadBillers,
    portalStore,
    requireBillingAuth,
    requireDoctorAuth,
    requireRequisitionPrintAuth,
    saveBillers,
  },
});

app.get("/api/audit-log/status", requireDoctorAuth, (req, res) => {
  return res.json({ authorized: Boolean(req.session.auditLogAuthorized) });
});

app.post("/api/audit-log/authorize", requireDoctorAuth, async (req, res) => {
  try {
    const pin = String(req.body?.pin || "").trim();
    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: "A 4-digit admin PIN is required." });
    }
    if (!appSettingsStore.verifyAdminPin(pin)) {
      auditLog(req, "audit_log_access", "denied", {
        reason: "invalid_pin",
      });
      return res.status(403).json({ error: "Invalid admin PIN." });
    }

    req.session.auditLogAuthorized = true;
    await saveSessionAsync(req);
    auditLog(req, "audit_log_access", "success");
    return res.json({ authorized: true });
  } catch (error) {
    auditLog(req, "audit_log_access", "failed", {
      reason: error?.message || "unexpected_error",
    });
    return res.status(500).json({ error: "Unable to authorize audit log access." });
  }
});

app.get("/api/audit-log", requireDoctorAuth, (req, res) => {
  if (!req.session.auditLogAuthorized) {
    return res.status(403).json({ error: "Admin PIN is required to view audit logs." });
  }

  try {
    const limit = Number(req.query?.limit || 200);
    return res.json({ entries: readAuditLogEntries(limit) });
  } catch (error) {
    auditLog(req, "audit_log_read", "failed", {
      reason: error?.message || "unexpected_error",
    });
    return res.status(500).json({ error: "Unable to load audit log." });
  }
});

registerAdminSettingsRoutes({
  app,
  dependencies: {
    appSettingsStore,
    auditLog,
    requireDoctorAuth,
  },
});

registerPortalWorkflowRoutes({
  app,
  dependencies: {
    auditLog,
    buildPatientProfileArtifacts,
    canAccessOrderRecord,
    getPortalDataForSession,
    getAppTimeZone: () => appSettingsStore.getTimeZone(),
    hasRequisitionAccess,
    orderIdPadLength,
    orderIdStartNumber,
    portalStore,
    requireAuthenticatedUser,
    requireDoctorAuth,
  },
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
  const existingPharmd = current?.pharmd && typeof current.pharmd === "object" ? current.pharmd : {};
  const requestLog = createPharmdLogEntry("info", "request", `PharmD send requested for ${requestedFileName}.`, {
    requestedBy,
    host: publicConfig.host,
    port: publicConfig.port,
    username: publicConfig.username,
    remoteDir: publicConfig.remoteDir,
  });

  const persistOrder = (patch = {}, extraLogs = []) => {
    const nowIso = new Date().toISOString();
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
    const receiptTrackingPatch = initializeReceiptTracking(existingPharmd, pharmdConfig, result.sentAt);

    const savedOrder = persistOrder({
      ...receiptTrackingPatch,
      status: "sent",
      sendStatus: "sent",
      deliveryStatus: "sent",
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

    schedulePharmdReceiptPolling();

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

app.post("/api/pharmd/orders/:orderId/check", requireDoctorAuth, async (req, res) => {
  const orderId = String(req.params.orderId || "").trim();
  const current = portalStore.getOrderById(orderId);
  if (!current || !canAccessOrderRecord(req, current)) {
    return res.status(404).json({ error: "Order not found." });
  }

  if (hasReceivedReceipt(current?.pharmd)) {
    return res.json({
      ok: true,
      found: true,
      message: "PharmD return file has already been received for this order.",
      order: current,
    });
  }

  if (!hasPendingPharmdReceipt(current)) {
    return res.json({
      ok: false,
      found: false,
      message: "Send the PharmD HL7 file before checking for a processed return file.",
      order: current,
    });
  }

  const summary = await triggerPharmdReceiptPoll({
    reason: `manual:${orderId}`,
    orderIds: [orderId],
    mode: "manual",
    force: true,
  });
  const updatedOrder = portalStore.getOrderById(orderId) || current;
  const found = Boolean(hasReceivedReceipt(updatedOrder?.pharmd));

  auditLog(req, "pharmd_receipt_check", found ? "success" : "miss", {
    orderId,
    matchedOrders: Number(summary?.matchedOrders || 0),
    checkedOrders: Number(summary?.checkedOrders || 0),
    exhaustedOrders: Number(summary?.exhaustedOrders || 0),
  });

  return res.json({
    ok: !summary?.error,
    found,
    message: summary?.error
      ? summary.error
      : found
      ? `PharmD return file received and stored for accession ${resolvePharmdAccession(updatedOrder)}.`
      : "No processed PharmD return file was found yet.",
    order: updatedOrder,
    summary,
  });
});

registerFacilityRoutes({
  app,
  dependencies: {
    auditLog,
    fetchJsonWithTimeout,
    getFacilityDataForSession,
    hashPassword,
    isPortalAccessEnabled,
    loadFacilityData,
    normalizePortalUsername,
    parseProviderDisplayName,
    requireAuthenticatedUser,
    requireDoctorAuth,
    resolveAccountIndex,
    resolveProviderIndex,
    saveFacilityData,
  },
});

registerReportPublishingRoutes({
  app,
  dependencies: {
    auditLog,
    buildLocalReportStorageKey,
    buildStoredFileKey,
    canAccessOrderRecord,
    ensureDir,
    getProviderPublishTargets,
    hasReportPdfAccess,
    isLocalGeneratedReportRecord,
    portalStore,
    publishEmailConfig: {
      apiKey: SENDGRID_API_KEY,
      mode: publishEmailMode,
      recipientEmail: PUBLISH_EMAIL_RECIPIENT,
      senderEmail: PUBLISH_EMAIL_SENDER,
    },
    publishFaxMode,
    reportPdfEnabled,
    reportPdfRendererPath,
    requireAuthenticatedUser,
    requireReportViewerAuth,
    resolveProviderForOrderPublish,
    resolveFacilityFaxForOrderPublish,
    resolveLocalReportStoragePath,
    s3Storage,
    shouldUseS3ForRequest,
    srfaxConfig: {
      accessId: SRFAX_ACCESS_ID,
      accessPwd: SRFAX_ACCESS_PWD,
      displayNumber: PUBLISH_FAX_DISPLAY_NUMBER,
      endpoint: SRFAX_ENDPOINT,
      receiverFaxDigits: PUBLISH_FAX_RECEIVER_DIGITS,
      senderEmail: SRFAX_SENDER_EMAIL,
      senderFaxDigits: PUBLISH_FAX_SENDER_DIGITS,
      timeoutMs: PUBLISH_FAX_TIMEOUT_MS,
    },
  },
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
    } else {
      const localKey = buildStoredFileKey("uploads", "raw", orderId || expectedSampleId || "unassigned", `${processedAt}-${fileName}`);
      const localPath = resolveLocalReportStoragePath(localKey);
      if (!localPath) {
        throw new Error("Unable to resolve local result upload storage path.");
      }
      ensureDir(path.dirname(localPath));
      fs.writeFileSync(localPath, fileBuffer);
      rawFile = {
        bucket: "local",
        key: localKey,
        storageType: "local",
        sizeBytes: fileBuffer.length,
      };
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
          storageType: "local",
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

app.get(["/", "/index.html", "/billing", "/billing/"], (_req, res) => {
  return sendClientFile(res, path.join(__dirname, "index.html"));
});

app.get("/app.js", (_req, res) => {
  return sendClientFile(res, path.join(__dirname, "app.js"));
});

app.get("/styles.css", (_req, res) => {
  return sendClientFile(res, path.join(__dirname, "styles.css"));
});

let activeServer = null;
let pharmdReceiptPollTimer = null;
let pharmdReceiptPollPromise = null;

function schedulePharmdReceiptPolling() {
  if (process.env.NODE_ENV === "test") return;
  if (pharmdReceiptPollTimer) {
    clearTimeout(pharmdReceiptPollTimer);
    pharmdReceiptPollTimer = null;
  }
  const nextDueAt = resolveNextReceiptDueAt(portalStore.listOrders(), getPharmdSftpConfig());
  if (!nextDueAt) return;
  const delayMs = Math.max(1000, new Date(nextDueAt).getTime() - Date.now());
  pharmdReceiptPollTimer = setTimeout(() => {
    pharmdReceiptPollTimer = null;
    triggerPharmdReceiptPoll({ reason: "scheduled", mode: "auto" }).catch(() => {});
  }, delayMs);
  if (typeof pharmdReceiptPollTimer.unref === "function") {
    pharmdReceiptPollTimer.unref();
  }
}

function triggerPharmdReceiptPoll({
  reason = "manual",
  orderIds = null,
  mode = "auto",
  force = false,
} = {}) {
  const queuedRun = (pharmdReceiptPollPromise || Promise.resolve())
    .catch(() => {})
    .then(() => pollPharmdReceiptFolderOnce({
      logger: console,
      orderIds,
      mode,
      force,
    }))
    .then((summary) => {
      if (summary?.matchedOrders) {
        console.log(`[pharmd] Receipt poll (${reason}) matched ${summary.matchedOrders} order(s).`);
      }
      if (summary?.exhaustedOrders) {
        console.log(`[pharmd] Receipt poll (${reason}) exhausted ${summary.exhaustedOrders} order(s).`);
      }
      return summary;
    })
    .finally(() => {
      if (pharmdReceiptPollPromise === queuedRun) {
        pharmdReceiptPollPromise = null;
      }
      schedulePharmdReceiptPolling();
    });
  pharmdReceiptPollPromise = queuedRun;
  return queuedRun;
}

function stopPharmdReceiptPolling() {
  if (pharmdReceiptPollTimer) {
    clearTimeout(pharmdReceiptPollTimer);
    pharmdReceiptPollTimer = null;
  }
}

function reconcilePreviouslyPublishedAmendments() {
  const successfulPublicationStatuses = new Set(["sent", "delivered", "queued", "accepted", "simulated", "logged", "success"]);
  const amendedOrders = portalStore.listOrders().flatMap((order) => {
    const amendment = order?.pharmd?.amendment;
    if (String(amendment?.status || "").trim().toLowerCase() !== "corrected_ready_for_publish") return [];

    const publication = order?.publishedReports?.final;
    const publicationStatus = String(publication?.status || "").trim().toLowerCase();
    const amendmentAt = new Date(amendment?.correctedAt || amendment?.initiatedAt || 0).getTime();
    const publishedAt = new Date(publication?.publishedAt || 0).getTime();
    if (!successfulPublicationStatuses.has(publicationStatus) || !Number.isFinite(amendmentAt) || !Number.isFinite(publishedAt) || publishedAt < amendmentAt) return [];

    const publishedBy = String(publication?.publishedBy || amendment?.initiatedBy || "system").trim();
    return [{
      ...order,
      updatedAt: publication.publishedAt,
      pharmd: {
        ...(order?.pharmd || {}),
        amendment: { ...amendment, status: "published", publishedAt: publication.publishedAt, publishedBy },
      },
      reportAmendments: (Array.isArray(order?.reportAmendments) ? order.reportAmendments : []).map((item) => (
        item?.id === amendment.id
          ? { ...item, status: "published", publishedAt: publication.publishedAt, publishedBy }
          : item
      )),
    }];
  });
  if (!amendedOrders.length) return 0;
  portalStore.upsertOrders(amendedOrders);
  console.log(`[workflow] Finalized ${amendedOrders.length} previously published amendment(s).`);
  return amendedOrders.length;
}

function startServer(port = PORT) {
  reconcilePreviouslyPublishedAmendments();
  return new Promise((resolve, reject) => {
    const server = app.listen(port, HOST);
    const handleError = (error) => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off("error", handleError);
      activeServer = server;
      schedulePharmdReceiptPolling();
      server.once("close", () => {
        if (activeServer === server) {
          activeServer = null;
          stopPharmdReceiptPolling();
        }
      });
      const resolvedPort = server.address()?.port ?? port;
      console.log(`LabCenter secure portal running at http://localhost:${resolvedPort}`);
      console.log(`[runtime] Data directory: ${dataDir}`);
      console.log(`[runtime] Session directory: ${sessionDir}`);
      resolve(server);
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  app,
  pollPharmdReceiptFolderOnce,
  startServer,
  portalStore,
  triggerPharmdReceiptPoll,
};
