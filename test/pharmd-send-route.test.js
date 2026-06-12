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

async function startPharmdHarness(envOverrides = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-pharmd-send-test-"));
  const dataDir = path.join(tempRoot, "runtime-data");
  const sessionDir = path.join(tempRoot, "sessions");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });

  const originalEnv = {
    DATA_DIR: process.env.DATA_DIR,
    SESSION_DIR: process.env.SESSION_DIR,
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
    PHARMD_SFTP_PASSWORD: process.env.PHARMD_SFTP_PASSWORD,
    PHARMD_SFTP_EXPECT_BINARY: process.env.PHARMD_SFTP_EXPECT_BINARY,
    PHARMD_SFTP_BINARY: process.env.PHARMD_SFTP_BINARY,
  };

  process.env.DATA_DIR = dataDir;
  process.env.SESSION_DIR = sessionDir;
  process.env.PORT = "0";
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "test-secret-for-pharmd-send-route";
  Object.entries(envOverrides || {}).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  });

  const serverPath = require.resolve("../server.js");
  delete require.cache[serverPath];
  const { startServer, portalStore } = require("../server.js");

  portalStore.upsertOrders([
    {
      orderId: "00001",
      patientId: "9001",
      patientName: "PharmD Patient",
      provider: "Workflow Provider",
      facilityName: "Workflow Facility",
      status: "Processed",
      createdAt: "2026-06-01T08:00:00.000Z",
      updatedAt: "2026-06-01T08:00:00.000Z",
      pharmd: {
        oruMessage: "MSH|^~\\&|LabCenter|Clinic|PharmD|CPD|20260601080000||ORU^R01|CTRL-1|P|2.5.1",
        messageFileName: "Order_00001_PharmD_ORU.hl7",
      },
    },
  ]);

  const server = await startServer(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const cookieJar = createCookieJar();

  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf-token`);
  cookieJar.merge(csrfResponse.headers);
  const csrfPayload = await csrfResponse.json();

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieJar.header(),
      "x-csrf-token": csrfPayload.csrfToken,
    },
    body: JSON.stringify({
      identifier: "admin@clinic.local",
      password: "ChangeMeNow!123",
    }),
  });
  cookieJar.merge(loginResponse.headers);
  const loginPayload = await loginResponse.json();
  assert.equal(loginResponse.status, 200);
  assert.ok(loginPayload.authenticated);
  assert.ok(loginPayload.csrfToken);

  return {
    baseUrl,
    cookieJar,
    csrfToken: loginPayload.csrfToken,
    portalStore,
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

test("PharmD send route returns an actionable runtime error when expect is unavailable", async (t) => {
  const harness = await startPharmdHarness({
    PHARMD_SFTP_PASSWORD: "top-secret",
    PHARMD_SFTP_EXPECT_BINARY: "/missing/custom-expect",
    PHARMD_SFTP_BINARY: "/usr/bin/sftp",
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.baseUrl}/api/pharmd/orders/00001/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.match(payload.message, /missing \(expect\)/i);
  assert.match(payload.message, /PHARMD_SFTP_EXPECT_BINARY/i);

  const storedOrder = harness.portalStore.getOrderById("00001");
  assert.equal(storedOrder?.pharmd?.sendStatus, "error");
  assert.equal(storedOrder?.pharmd?.lastError, payload.message);
});
