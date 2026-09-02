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

  const auditResponse = await fetch(`${harness.baseUrl}/api/portal/orders/00001/audit-events`, {
    headers: { Cookie: harness.cookieJar.header() },
  });
  assert.equal(auditResponse.status, 200);
  const auditPayload = await auditResponse.json();
  assert.equal(auditPayload.events.length, 1);
  assert.equal(auditPayload.events[0].eventType, "order_updated");
  assert.equal(auditPayload.events[0].actor, "admin@clinic.local");
});

test("order update route records an undone rejection in the audit trail", async (t) => {
  const harness = await startOrderUpdateHarness({
    status: "Rejected",
    statusBeforeRejection: "Processed",
    rejectedAt: "2026-06-01T09:00:00.000Z",
    rejectionReason: "Incorrect patient selection",
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
        rejectionUndoneAt: "2026-06-01T09:15:00.000Z",
        rejectionUndoneBy: "admin@clinic.local",
      },
    }),
  });

  assert.equal(response.status, 200);
  const auditResponse = await fetch(`${harness.baseUrl}/api/portal/orders/00001/audit-events`, {
    headers: { Cookie: harness.cookieJar.header() },
  });
  const auditPayload = await auditResponse.json();
  assert.equal(auditPayload.events[0].eventType, "order_rejection_undone");
  assert.equal(auditPayload.events[0].details.previousStatus, "Rejected");
  assert.equal(auditPayload.events[0].details.status, "Processed");
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

test("published reports require a reasoned amendment that preserves the original report reference", async (t) => {
  const harness = await startOrderUpdateHarness({
    status: "Complete",
    completedAt: "2026-06-01T09:30:00.000Z",
    publishedReports: {
      final: {
        publishedAt: "2026-06-01T10:00:00.000Z",
        publishedBy: "admin@clinic.local",
      },
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const missingReason = await fetch(`${harness.baseUrl}/api/portal/orders/00001/amendments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({ reason: "" }),
  });
  assert.equal(missingReason.status, 400);

  const response = await fetch(`${harness.baseUrl}/api/portal/orders/00001/amendments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({ reason: "Correcting an incorrect reported result." }),
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.order?.status, "Pending");
  assert.equal(payload.order?.pharmd?.amendment?.status, "pending_pharmd");
  assert.equal(payload.order?.reportAmendments?.length, 1);
  assert.equal(payload.order?.reportAmendments?.[0]?.reason, "Correcting an incorrect reported result.");
  assert.equal(payload.order?.reportAmendments?.[0]?.originalReport?.key, "labcenter/reports/final/00001/preview.pdf");
  assert.equal(payload.order?.reportAmendments?.[0]?.originalPublication?.publishedAt, "2026-06-01T10:00:00.000Z");

  const auditResponse = await fetch(`${harness.baseUrl}/api/portal/orders/00001/audit-events`, {
    headers: { Cookie: harness.cookieJar.header() },
  });
  assert.equal(auditResponse.status, 200);
  const auditPayload = await auditResponse.json();
  assert.equal(auditPayload.events[0]?.eventType, "report_amendment_initiated");
  assert.equal(auditPayload.events[0]?.reason, "Correcting an incorrect reported result.");
});

test("publishing a corrected report for testing finalizes its amendment", async (t) => {
  const harness = await startOrderUpdateHarness({
    status: "Complete",
    pharmd: {
      amendment: {
        id: "AMD-TEST-001",
        status: "corrected_ready_for_publish",
        correctedAt: "2026-06-01T11:00:00.000Z",
      },
    },
    reportAmendments: [{
      id: "AMD-TEST-001",
      status: "corrected_ready_for_publish",
      reason: "Corrected an incorrect reported result.",
    }],
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.baseUrl}/api/portal/orders/00001/mark-published-for-testing`, {
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
  assert.equal(payload.order?.pharmd?.amendment?.status, "published");
  assert.ok(payload.order?.pharmd?.amendment?.publishedAt);
  assert.equal(payload.order?.reportAmendments?.[0]?.status, "published");
});

test("server startup finalizes a correction that was test-published before the workflow update", async (t) => {
  const harness = await startOrderUpdateHarness({
    status: "Complete",
    publishedReports: {
      final: {
        publishedAt: "2026-06-01T12:00:00.000Z",
        publishedBy: "admin@clinic.local",
        status: "simulated",
        mode: "test",
      },
    },
    pharmd: {
      amendment: {
        id: "AMD-LEGACY-001",
        status: "corrected_ready_for_publish",
        correctedAt: "2026-06-01T11:00:00.000Z",
      },
    },
    reportAmendments: [{ id: "AMD-LEGACY-001", status: "corrected_ready_for_publish" }],
  });
  t.after(async () => {
    await harness.close();
  });

  const savedOrder = harness.portalStore.getOrderById("00001");
  assert.equal(savedOrder?.pharmd?.amendment?.status, "published");
  assert.equal(savedOrder?.pharmd?.amendment?.publishedAt, "2026-06-01T12:00:00.000Z");
  assert.equal(savedOrder?.reportAmendments?.[0]?.status, "published");
});
