const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function createCookieJar() {
  const jar = new Map();
  return {
    merge(headers) {
      const setCookies = typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : (headers.get("set-cookie") ? [headers.get("set-cookie")] : []);
      setCookies.forEach((cookie) => {
        const firstPart = String(cookie || "").split(";")[0];
        const eqIndex = firstPart.indexOf("=");
        if (eqIndex <= 0) return;
        const name = firstPart.slice(0, eqIndex);
        const value = firstPart.slice(eqIndex + 1);
        jar.set(name, value);
      });
    },
    header() {
      return Array.from(jar.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    },
  };
}

async function fetchCsrf(baseUrl, cookieJar) {
  const response = await fetch(`${baseUrl}/api/auth/csrf-token`, {
    headers: cookieJar.header() ? { Cookie: cookieJar.header() } : {},
  });
  cookieJar.merge(response.headers);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.csrfToken);
  return payload.csrfToken;
}

async function startAuthHarness(seedFacilityData = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-auth-route-test-"));
  const dataDir = path.join(tempRoot, "runtime-data");
  const sessionDir = path.join(tempRoot, "sessions");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });

  const facilityPath = path.join(dataDir, "facility.json");
  fs.writeFileSync(
    facilityPath,
    `${JSON.stringify({
      accounts: [],
      providers: [],
      ...seedFacilityData,
    }, null, 2)}\n`,
    "utf8"
  );

  const originalEnv = {
    DATA_DIR: process.env.DATA_DIR,
    SESSION_DIR: process.env.SESSION_DIR,
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };

  process.env.DATA_DIR = dataDir;
  process.env.SESSION_DIR = sessionDir;
  process.env.PORT = "0";
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "test-secret-for-auth-routes";

  const serverPath = require.resolve("../server.js");
  delete require.cache[serverPath];
  const { startServer } = require("../server.js");

  const server = await startServer(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    async loginAdmin(cookieJar = createCookieJar()) {
      const csrfToken = await fetchCsrf(baseUrl, cookieJar);
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieJar.header(),
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          identifier: "admin@clinic.local",
          password: "ChangeMeNow!123",
        }),
      });
      cookieJar.merge(response.headers);
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.ok(payload.authenticated);
      assert.ok(payload.csrfToken);
      return { cookieJar, csrfToken: payload.csrfToken, payload };
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
      delete require.cache[serverPath];
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    },
  };
}

async function postJson(baseUrl, routePath, cookieJar, csrfToken, body) {
  const response = await fetch(`${baseUrl}${routePath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieJar.header(),
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify(body),
  });
  cookieJar.merge(response.headers);
  return response;
}

test("admin auth routes expose local auth config and support login refresh and logout", async (t) => {
  const harness = await startAuthHarness();
  t.after(async () => {
    await harness.close();
  });

  const configResponse = await fetch(`${harness.baseUrl}/api/auth/config`);
  assert.equal(configResponse.status, 200);
  const configPayload = await configResponse.json();
  assert.equal(configPayload.adminAuthMode, "local");
  assert.equal(configPayload.oidcLoginUrl, null);

  const meBeforeResponse = await fetch(`${harness.baseUrl}/api/auth/me`);
  assert.equal(meBeforeResponse.status, 401);
  const meBeforePayload = await meBeforeResponse.json();
  assert.equal(meBeforePayload.authenticated, false);

  const { cookieJar, csrfToken, payload } = await harness.loginAdmin();
  assert.equal(payload.user.email, "admin@clinic.local");
  assert.equal(payload.user.authProvider, "local");

  const meAfterResponse = await fetch(`${harness.baseUrl}/api/auth/me`, {
    headers: {
      Cookie: cookieJar.header(),
    },
  });
  assert.equal(meAfterResponse.status, 200);
  const meAfterPayload = await meAfterResponse.json();
  assert.equal(meAfterPayload.authenticated, true);
  assert.equal(meAfterPayload.user.email, "admin@clinic.local");

  const refreshResponse = await postJson(
    harness.baseUrl,
    "/api/session/refresh",
    cookieJar,
    csrfToken,
    {}
  );
  assert.equal(refreshResponse.status, 200);
  const refreshPayload = await refreshResponse.json();
  assert.equal(refreshPayload.ok, true);
  assert.notEqual(refreshPayload.csrfToken, csrfToken);
  assert.ok(Number.isFinite(refreshPayload.session.remainingMs));
  assert.ok(refreshPayload.session.expiresAt);

  const logoutResponse = await postJson(
    harness.baseUrl,
    "/api/auth/logout",
    cookieJar,
    refreshPayload.csrfToken,
    {}
  );
  assert.equal(logoutResponse.status, 204);

  const meLoggedOutResponse = await fetch(`${harness.baseUrl}/api/auth/me`, {
    headers: {
      Cookie: cookieJar.header(),
    },
  });
  assert.equal(meLoggedOutResponse.status, 401);
  const meLoggedOutPayload = await meLoggedOutResponse.json();
  assert.equal(meLoggedOutPayload.authenticated, false);
});

test("client auth routes create an account-scoped portal session and support refresh/logout", async (t) => {
  const harness = await startAuthHarness();
  t.after(async () => {
    await harness.close();
  });

  const adminSession = await harness.loginAdmin();
  const createAccountResponse = await postJson(
    harness.baseUrl,
    "/api/facility/accounts",
    adminSession.cookieJar,
    adminSession.csrfToken,
    {
      basicInfo: {
        accountName: "North Clinic",
      },
      loginAccess: {
        accessType: "report_view",
        username: "North.Client",
        password: "Password123",
        defaultLanguage: "Spanish",
        privileges: {
          orders: true,
        },
      },
    }
  );
  assert.equal(createAccountResponse.status, 201);

  const clientJar = createCookieJar();
  const clientCsrf = await fetchCsrf(harness.baseUrl, clientJar);
  const clientLoginResponse = await postJson(
    harness.baseUrl,
    "/api/client-auth/login",
    clientJar,
    clientCsrf,
    {
      username: " north.client ",
      password: "Password123",
    }
  );
  assert.equal(clientLoginResponse.status, 200);
  const clientLoginPayload = await clientLoginResponse.json();
  assert.equal(clientLoginPayload.authenticated, true);
  assert.equal(clientLoginPayload.clientUser.username, "north.client");
  assert.equal(clientLoginPayload.clientUser.entityType, "account");
  assert.equal(clientLoginPayload.clientUser.accountName, "North Clinic");
  assert.equal(clientLoginPayload.clientUser.defaultLanguage, "Spanish");

  const clientMeResponse = await fetch(`${harness.baseUrl}/api/client-auth/me`, {
    headers: {
      Cookie: clientJar.header(),
    },
  });
  assert.equal(clientMeResponse.status, 200);
  const clientMePayload = await clientMeResponse.json();
  assert.equal(clientMePayload.authenticated, true);
  assert.equal(clientMePayload.clientUser.entityType, "account");

  const clientRefreshResponse = await postJson(
    harness.baseUrl,
    "/api/session/refresh",
    clientJar,
    clientLoginPayload.csrfToken,
    {}
  );
  assert.equal(clientRefreshResponse.status, 200);
  const clientRefreshPayload = await clientRefreshResponse.json();
  assert.equal(clientRefreshPayload.ok, true);
  assert.notEqual(clientRefreshPayload.csrfToken, clientLoginPayload.csrfToken);
  assert.ok(Number.isFinite(clientRefreshPayload.session.remainingMs));
  assert.ok(clientRefreshPayload.session.expiresAt);

  const clientLogoutResponse = await postJson(
    harness.baseUrl,
    "/api/client-auth/logout",
    clientJar,
    clientRefreshPayload.csrfToken,
    {}
  );
  assert.equal(clientLogoutResponse.status, 204);

  const clientMeLoggedOutResponse = await fetch(`${harness.baseUrl}/api/client-auth/me`, {
    headers: {
      Cookie: clientJar.header(),
    },
  });
  assert.equal(clientMeLoggedOutResponse.status, 401);
  const clientMeLoggedOutPayload = await clientMeLoggedOutResponse.json();
  assert.equal(clientMeLoggedOutPayload.authenticated, false);
});

test("client auth login resolves provider portal users with provider-scoped session details", async (t) => {
  const harness = await startAuthHarness();
  t.after(async () => {
    await harness.close();
  });

  const adminSession = await harness.loginAdmin();
  const createProviderResponse = await postJson(
    harness.baseUrl,
    "/api/facility/providers",
    adminSession.cookieJar,
    adminSession.csrfToken,
    {
      providerInfo: {
        designation: "Dr.",
        providerName: "Rivera",
        displayName: "Dr. Maria Rivera",
      },
      loginAccess: {
        accessType: "report_view_order",
        username: "Provider.Portal",
        password: "Password123",
        defaultLanguage: "English",
      },
    }
  );
  assert.equal(createProviderResponse.status, 201);

  const clientJar = createCookieJar();
  const clientCsrf = await fetchCsrf(harness.baseUrl, clientJar);
  const clientLoginResponse = await postJson(
    harness.baseUrl,
    "/api/client-auth/login",
    clientJar,
    clientCsrf,
    {
      username: "provider.portal",
      password: "Password123",
    }
  );
  assert.equal(clientLoginResponse.status, 200);
  const clientLoginPayload = await clientLoginResponse.json();
  assert.equal(clientLoginPayload.authenticated, true);
  assert.equal(clientLoginPayload.clientUser.entityType, "provider");
  assert.equal(clientLoginPayload.clientUser.accountName, "Dr. Rivera");
  assert.equal(clientLoginPayload.clientUser.accessType, "report_view_order");
});
