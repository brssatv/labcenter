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

async function startOrderUpdateHarness(seedOrder = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-order-update-test-"));
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
  };

  process.env.DATA_DIR = dataDir;
  process.env.SESSION_DIR = sessionDir;
  process.env.PORT = "0";
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "test-secret-for-order-update-route";

  const serverPath = require.resolve("../server.js");
  delete require.cache[serverPath];
  const { startServer, portalStore } = require("../server.js");

  portalStore.upsertOrders([
    {
      orderId: "00001",
      patientId: "9001",
      patientName: "Workflow Patient",
      provider: "Workflow Provider",
      facilityName: "Workflow Facility",
      status: "Processed",
      createdAt: "2026-06-01T08:00:00.000Z",
      updatedAt: "2026-06-01T08:00:00.000Z",
      generatedReports: {
        final: {
          bucket: "preview-bucket",
          key: "labcenter/reports/final/00001/preview.pdf",
          fileName: "Order_00001_Final_Report.pdf",
          mimeType: "application/pdf",
          sizeBytes: 12345,
          generatedAt: "2026-06-01T08:45:00.000Z",
        },
      },
      pharmd: {
        prePublishedAt: "2026-06-01T08:46:00.000Z",
        prePublishedBy: "admin@clinic.local",
        readyForPharmdAt: "2026-06-01T08:46:00.000Z",
      },
      ...seedOrder,
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

test("order update route persists Skip PharmD workflow fields", async (t) => {
  const harness = await startOrderUpdateHarness();
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.baseUrl}/api/portal/orders/00001`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({
      order: {
        pharmd: {
          prePublishedAt: "2026-06-01T08:46:00.000Z",
          prePublishedBy: "admin@clinic.local",
          readyForPharmdAt: "2026-06-01T08:46:00.000Z",
          skipPharmd: true,
          skipPharmdAt: "2026-06-01T09:00:00.000Z",
          validationReadyAt: "2026-06-01T09:00:00.000Z",
        },
      },
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.order?.pharmd?.skipPharmd, true);
  assert.equal(payload.order?.pharmd?.skipPharmdAt, "2026-06-01T09:00:00.000Z");
  assert.equal(payload.order?.pharmd?.validationReadyAt, "2026-06-01T09:00:00.000Z");
  assert.equal(payload.order?.generatedReports?.final?.bucket, "preview-bucket");

  const storedOrder = harness.portalStore.getOrderById("00001");
  assert.equal(storedOrder?.pharmd?.skipPharmd, true);
  assert.equal(storedOrder?.pharmd?.validationReadyAt, "2026-06-01T09:00:00.000Z");
  assert.equal(storedOrder?.generatedReports?.final?.key, "labcenter/reports/final/00001/preview.pdf");
});

test("order update route persists Completed workflow fields for Pending PharmD", async (t) => {
  const harness = await startOrderUpdateHarness({
    pharmd: {
      prePublishedAt: "2026-06-01T08:46:00.000Z",
      prePublishedBy: "admin@clinic.local",
      readyForPharmdAt: "2026-06-01T08:46:00.000Z",
      skipPharmd: true,
      skipPharmdAt: "2026-06-01T09:00:00.000Z",
      validationReadyAt: "2026-06-01T09:00:00.000Z",
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.baseUrl}/api/portal/orders/00001`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({
      order: {
        status: "Complete",
        completedAt: "2026-06-01T09:30:00.000Z",
        pharmd: {
          prePublishedAt: "2026-06-01T08:46:00.000Z",
          prePublishedBy: "admin@clinic.local",
          readyForPharmdAt: "2026-06-01T08:46:00.000Z",
          skipPharmd: true,
          skipPharmdAt: "2026-06-01T09:00:00.000Z",
          validationReadyAt: "2026-06-01T09:00:00.000Z",
          completedAt: "2026-06-01T09:30:00.000Z",
          completionSource: "skip_pharmd",
        },
      },
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.order?.status, "Complete");
  assert.equal(payload.order?.completedAt, "2026-06-01T09:30:00.000Z");
  assert.equal(payload.order?.pharmd?.completedAt, "2026-06-01T09:30:00.000Z");
  assert.equal(payload.order?.pharmd?.completionSource, "skip_pharmd");

  const storedOrder = harness.portalStore.getOrderById("00001");
  assert.equal(storedOrder?.status, "Complete");
  assert.equal(storedOrder?.completedAt, "2026-06-01T09:30:00.000Z");
  assert.equal(storedOrder?.pharmd?.completedAt, "2026-06-01T09:30:00.000Z");
});

test("order update route clears Completed workflow fields when returning to Pending PharmD", async (t) => {
  const harness = await startOrderUpdateHarness({
    status: "Complete",
    completedAt: "2026-06-01T09:30:00.000Z",
    pharmd: {
      prePublishedAt: "2026-06-01T08:46:00.000Z",
      prePublishedBy: "admin@clinic.local",
      readyForPharmdAt: "2026-06-01T08:46:00.000Z",
      skipPharmd: true,
      skipPharmdAt: "2026-06-01T09:00:00.000Z",
      validationReadyAt: "2026-06-01T09:00:00.000Z",
      completedAt: "2026-06-01T09:30:00.000Z",
      completionSource: "skip_pharmd",
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.baseUrl}/api/portal/orders/00001`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({
      order: {
        status: "Processed",
        completedAt: "",
        pharmd: {
          prePublishedAt: "2026-06-01T08:46:00.000Z",
          prePublishedBy: "admin@clinic.local",
          readyForPharmdAt: "2026-06-01T08:46:00.000Z",
          skipPharmd: true,
          skipPharmdAt: "2026-06-01T09:00:00.000Z",
          validationReadyAt: "2026-06-01T09:00:00.000Z",
        },
      },
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.order?.status, "Processed");
  assert.equal(payload.order?.completedAt, "");
  assert.equal(payload.order?.pharmd?.completedAt, undefined);
  assert.equal(payload.order?.pharmd?.completionSource, undefined);
  assert.equal(payload.order?.generatedReports?.final?.bucket, "preview-bucket");

  const storedOrder = harness.portalStore.getOrderById("00001");
  assert.equal(storedOrder?.status, "Processed");
  assert.equal(storedOrder?.completedAt, "");
  assert.equal(storedOrder?.pharmd?.completedAt, undefined);
  assert.equal(storedOrder?.pharmd?.completionSource, undefined);
  assert.equal(storedOrder?.generatedReports?.final?.key, "labcenter/reports/final/00001/preview.pdf");
});
