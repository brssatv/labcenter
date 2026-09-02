const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");

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

async function createSamplePdfBuffer(label, width = 420, height = 280) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([width, height]);
  page.drawText(String(label || "Sample PDF"), {
    x: 32,
    y: height - 52,
    size: 18,
  });
  return Buffer.from(await pdf.save());
}

function writeFacilityData(harness, payload = {}) {
  const facilityPath = path.join(harness.dataDir, "facility.json");
  fs.writeFileSync(
    facilityPath,
    `${JSON.stringify({
      importedAt: null,
      sourceFiles: {},
      accounts: [],
      providers: [],
      ...payload,
    }, null, 2)}\n`,
    "utf8"
  );
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
    LABCENTER_ENABLE_REPORT_PDF: process.env.LABCENTER_ENABLE_REPORT_PDF,
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
  process.env.LABCENTER_ENABLE_REPORT_PDF = "true";
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

test("generated report preview route returns a locally stored summary PDF", async (t) => {
  const localStorageKey = "generated-reports/summary/00001/summary.pdf";
  const harness = await startTestServer({
    generatedReports: {
      summary: {
        bucket: "local",
        key: localStorageKey,
        storageType: "local",
        fileName: "Order_00001_Summary_Report.pdf",
        mimeType: "application/pdf",
      },
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const absoluteLocalPath = path.join(harness.dataDir, localStorageKey);
  fs.mkdirSync(path.dirname(absoluteLocalPath), { recursive: true });
  fs.writeFileSync(absoluteLocalPath, Buffer.from("%PDF-local-summary", "utf8"));

  const response = await fetch(`${harness.baseUrl}/api/orders/00001/generated-report-pdf/summary`, {
    headers: {
      Cookie: harness.cookieJar.header(),
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.toString("utf8"), "%PDF-local-summary");
});

test("report rendering reuses an unchanged saved PDF and returns lightweight preview metadata", async (t) => {
  const html = "<!doctype html><html><body><h1>Cached summary</h1></body></html>";
  const sourceHash = crypto.createHash("sha256").update(html, "utf8").digest("hex");
  const localStorageKey = "generated-reports/summary/00001/cached-summary.pdf";
  const harness = await startTestServer({
    generatedReports: {
      summary: {
        bucket: "local",
        key: localStorageKey,
        storageType: "local",
        fileName: "Order_00001_Summary_Report.pdf",
        mimeType: "application/pdf",
        sourceHash,
      },
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const absoluteLocalPath = path.join(harness.dataDir, localStorageKey);
  fs.mkdirSync(path.dirname(absoluteLocalPath), { recursive: true });
  fs.writeFileSync(absoluteLocalPath, Buffer.from("%PDF-cached-summary", "utf8"));

  const response = await fetch(`${harness.baseUrl}/api/orders/render-report-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({
      orderId: "00001",
      reportType: "summary",
      fileName: "Order_00001_Summary_Report.pdf",
      responseMode: "saved-url",
      html,
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ready, true);
  assert.equal(payload.cached, true);
  assert.equal(payload.reportType, "summary");
  assert.equal(fs.readFileSync(absoluteLocalPath, "utf8"), "%PDF-cached-summary");
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
      oruMessage: "MSH|^~\\&|LabCenter|Preview Facility|PharmD|CPD|20260601084600||ORU^R01|00001-20260601084600|P|2.5.1\rOBX|1|ST|^Influenza A|Pathogens|Detected|",
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.match(payload.message, /PrePublish completed/i);
  assert.ok(payload.order?.pharmd?.prePublishedAt);
  assert.equal(payload.order?.pharmd?.prePublishedBy, "admin@clinic.local");
  assert.equal(payload.order?.pharmd?.prePublishedFileName, "Order_00001_Final_Report.pdf");
  assert.equal(payload.order?.pharmd?.readyForPharmdAt, payload.order?.pharmd?.prePublishedAt);
  assert.match(payload.order?.pharmd?.oruMessage || "", /Influenza A\|Pathogens\|Detected/);
  assert.equal(payload.order?.pharmd?.status, "ready");
  assert.ok(payload.order?.pharmd?.oruSourceHash);
  assert.equal(payload.order?.generatedReports?.final?.bucket, "local");
  assert.equal(payload.order?.generatedReports?.final?.storageType, "local");
  assert.ok(String(payload.order?.generatedReports?.final?.key || "").startsWith("generated-reports/final/00001/"));
  assert.ok(
    fs.existsSync(path.resolve(harness.dataDir, payload.order.generatedReports.final.key)),
    "expected local prepublished final report to exist on disk"
  );
});

test("prepublish replaces a stale ORU and resets prior delivery state", async (t) => {
  const staleOru = "MSH|^~\\&|LabCenter|Preview Facility|PharmD|CPD|20260601080000||ORU^R01|OLD|P|2.5.1\rOBX|1|ST|^Influenza A|Pathogens|Not Detected|";
  const latestOru = "MSH|^~\\&|LabCenter|Preview Facility|PharmD|CPD|20260601100000||ORU^R01|NEW|P|2.5.1\rOBX|1|ST|^Influenza A|Pathogens|Detected - High|";
  const harness = await startTestServer({
    pharmd: {
      oruMessage: staleOru,
      status: "sent",
      sendStatus: "sent",
      deliveryStatus: "sent",
      sentAt: "2026-06-01T09:00:00.000Z",
      remotePath: "oru/old.hl7",
      receivedAt: "2026-06-01T09:30:00.000Z",
      reportReceivedAt: "2026-06-01T09:30:00.000Z",
      reportReceivedFileName: "old-return.pdf",
      receivedReport: { bucket: "local", key: "old-return.pdf" },
      receiptPollingStatus: "matched",
      logs: [{ ts: "2026-06-01T09:00:00.000Z", level: "info", step: "send", message: "Previously sent." }],
    },
  });
  t.after(async () => harness.close());

  const response = await fetch(`${harness.baseUrl}/api/orders/publish-final-report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({
      orderId: "00001",
      fileName: "Order_00001_Final_Report.pdf",
      html: "<!doctype html><html><body><h1>Approved updated result</h1></body></html>",
      oruMessage: latestOru,
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.order?.pharmd?.oruMessage, latestOru);
  assert.equal(payload.order?.pharmd?.status, "ready");
  assert.equal(payload.order?.pharmd?.sendStatus, "ready");
  assert.equal(payload.order?.pharmd?.deliveryStatus, "ready");
  assert.equal(payload.order?.pharmd?.sentAt, undefined);
  assert.equal(payload.order?.pharmd?.remotePath, undefined);
  assert.equal(payload.order?.pharmd?.reportReceivedAt, undefined);
  assert.equal(payload.order?.pharmd?.receivedReport, undefined);
  assert.equal(payload.order?.pharmd?.receiptPollingStatus, undefined);
  assert.equal(payload.order?.pharmd?.logs?.length, 1, "historical delivery logs should be retained");
  assert.ok(payload.order?.generatedReports?.final?.sourceHash);
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

test("publish fax details route returns the matched account fax number for the order", async (t) => {
  const harness = await startTestServer({});
  t.after(async () => {
    await harness.close();
  });

  writeFacilityData(harness, {
    accounts: [
      {
        name: "Preview Facility",
        fax_number: "5554441212",
      },
    ],
    providers: [
      {
        provider_name: "Preview Provider",
        fax_number: "5550009999",
      },
    ],
  });

  const response = await fetch(`${harness.baseUrl}/api/orders/00001/publish-fax-details`, {
    headers: {
      Cookie: harness.cookieJar.header(),
    },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.senderFaxNumber, "352-565-4554");
  assert.equal(payload.recipientFaxDigits, "5554441212");
  assert.equal(payload.recipientFaxNumber, "555-444-1212");
  assert.equal(payload.recipientAvailable, true);
});

test("publish fax details route reads a nested matched account fax number", async (t) => {
  const harness = await startTestServer({});
  t.after(async () => {
    await harness.close();
  });

  writeFacilityData(harness, {
    accounts: [
      {
        name: "Preview Facility",
        basic_information: {
          accountName: "Preview Facility",
          faxNumber: "5557772323",
        },
      },
    ],
    providers: [],
  });

  const response = await fetch(`${harness.baseUrl}/api/orders/00001/publish-fax-details`, {
    headers: { Cookie: harness.cookieJar.header() },
  });

  const payload = await response.json();
  assert.equal(response.status, 200, payload.error);
  assert.equal(payload.recipientFaxDigits, "5557772323");
  assert.equal(payload.recipientFaxNumber, "555-777-2323");
  assert.equal(payload.recipientAvailable, true);
});

test("publish fax route sends only the saved final report when PharmD is bypassed", async (t) => {
  const localStorageKey = "generated-reports/final/00001/bypassed.pdf";
  const harness = await startTestServer({
    generatedReports: {
      final: {
        bucket: "local",
        key: localStorageKey,
        storageType: "local",
        fileName: "Order_00001_Final_Report.pdf",
        mimeType: "application/pdf",
      },
    },
    pharmd: {
      skipPharmd: true,
      amendment: { id: "AMD-FAX-001", status: "corrected_ready_for_publish" },
    },
    reportAmendments: [{ id: "AMD-FAX-001", status: "corrected_ready_for_publish" }],
  }, {
    LABCENTER_PUBLISH_FAX_MODE: "simulated",
  });
  t.after(async () => {
    await harness.close();
  });

  writeFacilityData(harness, {
    accounts: [{ name: "Preview Facility", fax_number: "5557772323" }],
    providers: [],
  });
  const finalPdfBuffer = await createSamplePdfBuffer("Bypassed final report");
  const absoluteLocalPath = path.join(harness.dataDir, "generated-reports", "final", "00001", "bypassed.pdf");
  fs.mkdirSync(path.dirname(absoluteLocalPath), { recursive: true });
  fs.writeFileSync(absoluteLocalPath, finalPdfBuffer);

  const response = await fetch(`${harness.baseUrl}/api/orders/00001/publish-fax`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({ confirmed: true }),
  });

  const payload = await response.json();
  assert.equal(response.status, 200, payload.error);
  assert.equal(payload.order?.publishedReports?.final?.fileName, "Order_00001_Final_Report.pdf");
  assert.equal(payload.fax?.recipientFaxDigits, "5557772323");
  assert.equal(payload.order?.pharmd?.amendment?.status, "published");
  assert.ok(payload.order?.pharmd?.amendment?.publishedAt);
  assert.equal(payload.order?.reportAmendments?.[0]?.status, "published");
});

test("publish fax route returns 404 when the PharmD return file is missing for the combined PDF", async (t) => {
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
    body: JSON.stringify({ confirmed: true }),
  });

  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.error, "PharmD return file not found for this order.");
});

test("publish fax route returns 404 when no facility fax number is configured for the order", async (t) => {
  const localStorageKey = "generated-reports/final/00001/preview.pdf";
  const pharmdStorageKey = "pharmd-receipts/00001/receipt.pdf";
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
    pharmd: {
      reportReceivedAt: "2026-06-01T09:10:00.000Z",
      receivedReport: {
        bucket: "local",
        key: pharmdStorageKey,
        storageType: "local",
        fileName: "Order_00001_PharmD_Report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 17,
        createdAt: "2026-06-01T09:10:00.000Z",
      },
    },
  }, {
    LABCENTER_PUBLISH_FAX_MODE: "simulated",
  });
  t.after(async () => {
    await harness.close();
  });

  writeFacilityData(harness, {
    providers: [{ provider_name: "Preview Provider", fax_number: "5550009999" }],
  });

  const finalPdfBuffer = await createSamplePdfBuffer("Final report preview");
  const pharmdPdfBuffer = await createSamplePdfBuffer("PharmD return");
  const absoluteLocalPath = path.join(harness.dataDir, "generated-reports", "final", "00001", "preview.pdf");
  fs.mkdirSync(path.dirname(absoluteLocalPath), { recursive: true });
  fs.writeFileSync(absoluteLocalPath, finalPdfBuffer);
  const absolutePharmdPath = path.join(harness.dataDir, "pharmd-receipts", "00001", "receipt.pdf");
  fs.mkdirSync(path.dirname(absolutePharmdPath), { recursive: true });
  fs.writeFileSync(absolutePharmdPath, pharmdPdfBuffer);

  const response = await fetch(`${harness.baseUrl}/api/orders/00001/publish-fax`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({ confirmed: true }),
  });

  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.error, "Facility fax number is not configured for this order.");
});

test("publish fax route records a simulated SRFax send using the combined PharmD PDF", async (t) => {
  const localStorageKey = "generated-reports/final/00001/preview.pdf";
  const pharmdStorageKey = "pharmd-receipts/00001/receipt.pdf";
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
    pharmd: {
      reportReceivedAt: "2026-06-01T09:10:00.000Z",
      receivedReport: {
        bucket: "local",
        key: pharmdStorageKey,
        storageType: "local",
        fileName: "Order_00001_PharmD_Report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 17,
        createdAt: "2026-06-01T09:10:00.000Z",
      },
    },
  }, {
    LABCENTER_PUBLISH_FAX_MODE: "simulated",
    SRFAX_SENDER_EMAIL: "qa@example.com",
  });
  t.after(async () => {
    await harness.close();
  });

  writeFacilityData(harness, {
    accounts: [
      {
        name: "Preview Facility",
        fax_number: "5554441212",
      },
    ],
    providers: [],
  });

  const finalPdfBuffer = await createSamplePdfBuffer("Final report preview");
  const pharmdPdfBuffer = await createSamplePdfBuffer("PharmD return");
  const absoluteLocalPath = path.join(harness.dataDir, "generated-reports", "final", "00001", "preview.pdf");
  fs.mkdirSync(path.dirname(absoluteLocalPath), { recursive: true });
  fs.writeFileSync(absoluteLocalPath, finalPdfBuffer);
  const absolutePharmdPath = path.join(harness.dataDir, "pharmd-receipts", "00001", "receipt.pdf");
  fs.mkdirSync(path.dirname(absolutePharmdPath), { recursive: true });
  fs.writeFileSync(absolutePharmdPath, pharmdPdfBuffer);

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
  assert.equal(payload.fax?.recipientFaxDigits, "5554441212");
  assert.equal(payload.fax?.recipientFaxNumber, "555-444-1212");
  assert.equal(payload.fax?.senderEmail, "qa@example.com");
  assert.equal(payload.order?.publishedReports?.final?.channel, "fax");
  assert.equal(payload.order?.publishedReports?.final?.deliveryVendor, "SRFax");
  assert.equal(payload.order?.publishedReports?.final?.status, "simulated");
  assert.equal(payload.order?.publishedReports?.final?.mode, "simulated");
  assert.equal(payload.order?.publishedReports?.final?.senderFaxNumber, "352-565-4554");
  assert.equal(payload.order?.publishedReports?.final?.recipientFaxDigits, "5554441212");
  assert.equal(payload.order?.publishedReports?.final?.recipientFaxNumber, "555-444-1212");
  assert.equal(payload.order?.publishedReports?.final?.fileName, "Order_00001_Final_PharmD_Combined.pdf");
  assert.ok(payload.order?.publishedReports?.final?.publishedAt);
});
