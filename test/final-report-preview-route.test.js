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

async function startTestServer(seedOrder, envOverrides = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-final-preview-test-"));
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
    LABCENTER_PUBLISH_FAX_MODE: process.env.LABCENTER_PUBLISH_FAX_MODE,
    SRFAX_ACCESS_ID: process.env.SRFAX_ACCESS_ID,
    SRFAX_ACCESS_PWD: process.env.SRFAX_ACCESS_PWD,
    SRFAX_SENDER_EMAIL: process.env.SRFAX_SENDER_EMAIL,
    SRFAX_ENDPOINT: process.env.SRFAX_ENDPOINT,
  };

  process.env.DATA_DIR = dataDir;
  process.env.SESSION_DIR = sessionDir;
  process.env.PORT = "0";
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "test-secret-for-final-preview-route";
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
      patientName: "Preview Patient",
      provider: "Preview Provider",
      facilityName: "Preview Facility",
      status: "Processed",
      createdAt: "2026-06-01T08:00:00.000Z",
      updatedAt: "2026-06-01T08:00:00.000Z",
      processedResult: {
        processedAt: "2026-06-01T08:30:00.000Z",
        report: {
          panelName: "Respiratory Pathogens Panel",
          summary: { sampleCount: 1, totalRows: 1, detectedCount: 1 },
          detected: [{ pathogen: "Influenza A", result: "Detected", ctValue: "28.2" }],
          detailed: [{ pathogen: "Influenza A", result: "Detected", ctValue: "28.2", sample: "RP00001" }],
        },
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

  return {
    baseUrl,
    cookieJar,
    dataDir,
    csrfToken: loginPayload.csrfToken,
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

test("final report preview route returns 404 when no saved final report metadata exists", async (t) => {
  const harness = await startTestServer({});
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.baseUrl}/api/orders/00001/final-report-pdf`, {
    headers: {
      Cookie: harness.cookieJar.header(),
    },
  });

  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.error, "Saved final report PDF not found for this order.");
});

test("final report preview route returns 503 when metadata exists but S3 is unavailable", async (t) => {
  const harness = await startTestServer({
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
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.baseUrl}/api/orders/00001/final-report-pdf`, {
    headers: {
      Cookie: harness.cookieJar.header(),
    },
  });

  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error, "S3 report storage is not configured for this environment.");
});

test("final report preview route returns a locally stored PDF when local metadata exists", async (t) => {
  const localStorageKey = "generated-reports/final/00001/preview.pdf";
  const harness = await startTestServer({
    generatedReports: {
      final: {
        bucket: "local",
        key: localStorageKey,
        storageType: "local",
        fileName: "Order_00001_Final_Report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 17,
        generatedAt: "2026-06-01T08:45:00.000Z",
      },
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const absoluteLocalPath = path.join(harness.dataDir, "generated-reports", "final", "00001", "preview.pdf");
  fs.mkdirSync(path.dirname(absoluteLocalPath), { recursive: true });
  fs.writeFileSync(absoluteLocalPath, Buffer.from("%PDF-local-preview", "utf8"));

  const response = await fetch(`${harness.baseUrl}/api/orders/00001/final-report-pdf`, {
    headers: {
      Cookie: harness.cookieJar.header(),
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.toString("utf8"), "%PDF-local-preview");
});

test("prepublish route does not require provider publish settings and marks the order ready for PharmD", async (t) => {
  const harness = await startTestServer({
    provider: "Unmatched Provider",
    facilityName: "Unmatched Facility",
  });
  t.after(async () => {
    await harness.close();
  });

  const csrfResponse = await fetch(`${harness.baseUrl}/api/auth/csrf-token`, {
    headers: {
      Cookie: harness.cookieJar.header(),
    },
  });
  harness.cookieJar.merge(csrfResponse.headers);
  const csrfPayload = await csrfResponse.json();

  const response = await fetch(`${harness.baseUrl}/api/orders/publish-final-report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": csrfPayload.csrfToken,
    },
    body: JSON.stringify({
      orderId: "00001",
      fileName: "Order_00001_Final_Report.pdf",
      html: "<!doctype html><html><body><h1>PrePublish</h1><p>Ready for PharmD.</p></body></html>",
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.match(payload.message, /PrePublish completed/i);
  assert.ok(payload.order?.pharmd?.prePublishedAt);
  assert.equal(payload.order?.pharmd?.prePublishedBy, "admin@clinic.local");
  assert.equal(payload.order?.pharmd?.prePublishedFileName, "Order_00001_Final_Report.pdf");
  assert.equal(payload.order?.pharmd?.readyForPharmdAt, payload.order?.pharmd?.prePublishedAt);
  assert.equal(payload.order?.generatedReports?.final?.bucket, "local");
  assert.equal(payload.order?.generatedReports?.final?.storageType, "local");
  assert.ok(String(payload.order?.generatedReports?.final?.key || "").startsWith("generated-reports/final/00001/"));
  assert.ok(
    fs.existsSync(path.resolve(harness.dataDir, payload.order.generatedReports.final.key)),
    "expected local prepublished final report to exist on disk"
  );
});

test("publish fax route requires an explicit confirmation flag", async (t) => {
  const localStorageKey = "generated-reports/final/00001/preview.pdf";
  const harness = await startTestServer({
    generatedReports: {
      final: {
        bucket: "local",
        key: localStorageKey,
        storageType: "local",
        fileName: "Order_00001_Final_Report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 17,
        generatedAt: "2026-06-01T08:45:00.000Z",
      },
    },
  }, {
    LABCENTER_PUBLISH_FAX_MODE: "simulated",
  });
  t.after(async () => {
    await harness.close();
  });

  const absoluteLocalPath = path.join(harness.dataDir, "generated-reports", "final", "00001", "preview.pdf");
  fs.mkdirSync(path.dirname(absoluteLocalPath), { recursive: true });
  fs.writeFileSync(absoluteLocalPath, Buffer.from("%PDF-local-preview", "utf8"));

  const response = await fetch(`${harness.baseUrl}/api/orders/00001/publish-fax`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({ confirmed: false }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, "Fax send confirmation is required.");
});

test("publish fax route returns 503 when fax publishing is disabled", async (t) => {
  const localStorageKey = "generated-reports/final/00001/preview.pdf";
  const harness = await startTestServer({
    generatedReports: {
      final: {
        bucket: "local",
        key: localStorageKey,
        storageType: "local",
        fileName: "Order_00001_Final_Report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 17,
        generatedAt: "2026-06-01T08:45:00.000Z",
      },
    },
  }, {
    LABCENTER_PUBLISH_FAX_MODE: "disabled",
  });
  t.after(async () => {
    await harness.close();
  });

  const absoluteLocalPath = path.join(harness.dataDir, "generated-reports", "final", "00001", "preview.pdf");
  fs.mkdirSync(path.dirname(absoluteLocalPath), { recursive: true });
  fs.writeFileSync(absoluteLocalPath, Buffer.from("%PDF-local-preview", "utf8"));

  const response = await fetch(`${harness.baseUrl}/api/orders/00001/publish-fax`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({ confirmed: true }),
  });

  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.match(payload.error, /Fax publishing is disabled/i);
});

test("publish fax route records a simulated SRFax send using the saved final PDF", async (t) => {
  const localStorageKey = "generated-reports/final/00001/preview.pdf";
  const harness = await startTestServer({
    generatedReports: {
      final: {
        bucket: "local",
        key: localStorageKey,
        storageType: "local",
        fileName: "Order_00001_Final_Report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 17,
        generatedAt: "2026-06-01T08:45:00.000Z",
      },
    },
  }, {
    LABCENTER_PUBLISH_FAX_MODE: "simulated",
    SRFAX_SENDER_EMAIL: "qa@example.com",
  });
  t.after(async () => {
    await harness.close();
  });

  const absoluteLocalPath = path.join(harness.dataDir, "generated-reports", "final", "00001", "preview.pdf");
  fs.mkdirSync(path.dirname(absoluteLocalPath), { recursive: true });
  fs.writeFileSync(absoluteLocalPath, Buffer.from("%PDF-local-preview", "utf8"));

  const response = await fetch(`${harness.baseUrl}/api/orders/00001/publish-fax`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({ confirmed: true }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.match(payload.message, /Fax simulated successfully/i);
  assert.equal(payload.fax?.mode, "simulated");
  assert.equal(payload.fax?.status, "simulated");
  assert.match(String(payload.fax?.faxDetailsId || ""), /^SIM-/);
  assert.equal(payload.fax?.senderFaxNumber, "352-565-4554");
  assert.equal(payload.fax?.recipientFaxNumber, "352-565-4554");
  assert.equal(payload.fax?.senderEmail, "qa@example.com");
  assert.equal(payload.order?.publishedReports?.final?.channel, "fax");
  assert.equal(payload.order?.publishedReports?.final?.deliveryVendor, "SRFax");
  assert.equal(payload.order?.publishedReports?.final?.status, "simulated");
  assert.equal(payload.order?.publishedReports?.final?.mode, "simulated");
  assert.equal(payload.order?.publishedReports?.final?.senderFaxNumber, "352-565-4554");
  assert.equal(payload.order?.publishedReports?.final?.recipientFaxNumber, "352-565-4554");
  assert.equal(payload.order?.publishedReports?.final?.fileName, "Order_00001_Final_Report.pdf");
  assert.ok(payload.order?.publishedReports?.final?.publishedAt);
});
