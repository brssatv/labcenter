const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildAccessionNumber } = require("../lib/accession-number");

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

async function startPortalHarness() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-portal-route-test-"));
  const dataDir = path.join(tempRoot, "runtime-data");
  const sessionDir = path.join(tempRoot, "sessions");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });

  const facilityPath = path.join(dataDir, "facility.json");
  fs.writeFileSync(facilityPath, `${JSON.stringify({ accounts: [], providers: [] }, null, 2)}\n`, "utf8");

  const originalEnv = {
    DATA_DIR: process.env.DATA_DIR,
    SESSION_DIR: process.env.SESSION_DIR,
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
    LABCENTER_TIME_ZONE: process.env.LABCENTER_TIME_ZONE,
    LABCENTER_ACCESSION_TIME_ZONE: process.env.LABCENTER_ACCESSION_TIME_ZONE,
  };

  process.env.DATA_DIR = dataDir;
  process.env.SESSION_DIR = sessionDir;
  process.env.PORT = "0";
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "test-secret-for-portal-routes";
  process.env.LABCENTER_TIME_ZONE = "UTC";
  process.env.LABCENTER_ACCESSION_TIME_ZONE = "UTC";

  const serverPath = require.resolve("../server.js");
  delete require.cache[serverPath];
  const { startServer } = require("../server.js");

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

async function sendJson(harness, routePath, body, method = "POST") {
  const response = await fetch(`${harness.baseUrl}${routePath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify(body),
  });
  harness.cookieJar.merge(response.headers);
  const payload = await response.json();
  return { response, payload };
}

test("portal import-local route hydrates registrations orders and upload log data", async (t) => {
  const harness = await startPortalHarness();
  t.after(async () => {
    await harness.close();
  });

  const { response, payload } = await sendJson(harness, "/api/portal/import-local", {
    registrations: [
      {
        patientId: "9001",
        firstName: "Imported",
        lastName: "Patient",
      },
    ],
    orders: [
      {
        orderId: "00001",
        patientId: "9001",
        patientName: "Imported Patient",
        status: "Pending",
      },
    ],
    uploadResultsLog: [
      {
        ts: "2026-06-01T09:00:00.000Z",
        message: "Imported upload log entry",
      },
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(payload.imported.registrations, 1);
  assert.equal(payload.imported.orders, 1);
  assert.equal(payload.imported.uploadResultsLog, 1);
  assert.equal(payload.timeZone, "UTC");
  assert.equal(payload.registrations.length, 1);
  assert.equal(payload.orders.length, 1);
  assert.equal(payload.uploadResultsLog.length, 1);

  const portalDataResponse = await fetch(`${harness.baseUrl}/api/portal/data`, {
    headers: {
      Cookie: harness.cookieJar.header(),
    },
  });
  assert.equal(portalDataResponse.status, 200);
  const portalDataPayload = await portalDataResponse.json();
  assert.equal(portalDataPayload.timeZone, "UTC");
  assert.equal(portalDataPayload.registrations.length, 1);
  assert.equal(portalDataPayload.orders.length, 1);
  assert.equal(portalDataPayload.uploadResultsLog.length, 1);
});

test("portal registration order id bulk order and upload-log routes persist workflow data", async (t) => {
  const harness = await startPortalHarness();
  t.after(async () => {
    await harness.close();
  });

  const orderIdsResult = await sendJson(harness, "/api/portal/order-ids", { count: 2 });
  assert.equal(orderIdsResult.response.status, 200);
  assert.deepEqual(orderIdsResult.payload.orderIds, ["00001", "00002"]);

  const registrationResult = await sendJson(harness, "/api/portal/registrations", {
    submissionId: "registration-workflow-0001",
    registration: {
      patientId: "9001",
      firstName: "Portal",
      lastName: "Patient",
      provider: "Dr. Rivera",
      facilityName: "North Clinic",
    },
  });
  assert.equal(registrationResult.response.status, 200);
  assert.equal(registrationResult.payload.registration.patientId, "9001");
  assert.equal(registrationResult.payload.totalCount, 1);

  const bulkOrdersResult = await sendJson(harness, "/api/portal/orders/bulk", {
    submissionId: "orders-workflow-0001",
    orders: [
      {
        orderId: "00001",
        patientId: "9001",
        patientName: "Portal Patient",
        provider: "Dr. Rivera",
        facilityName: "North Clinic",
        accessionNo: "SHOULD-NOT-BE-USED",
        accessionPrefix: "EY",
        services: [
          {
            serviceName: "Eye Panel",
          },
        ],
        status: "Pending",
      },
      {
        orderId: "00002",
        patientId: "9001",
        patientName: "Portal Patient",
        provider: "Dr. Rivera",
        facilityName: "North Clinic",
        accessionPrefix: "UT",
        services: [
          {
            serviceName: "Urinary Tract Infection PCR Panel",
          },
        ],
        status: "Pending",
      },
    ],
  });
  assert.equal(bulkOrdersResult.response.status, 200);
  assert.equal(bulkOrdersResult.payload.orders.length, 2);
  assert.equal(bulkOrdersResult.payload.orders[0].accessionNo, buildAccessionNumber({
    prefix: "EY",
    createdAt: bulkOrdersResult.payload.orders[0].createdAt,
    dailySequence: 1,
    timeZone: "UTC",
  }));
  assert.equal(bulkOrdersResult.payload.orders[1].accessionNo, buildAccessionNumber({
    prefix: "UT",
    createdAt: bulkOrdersResult.payload.orders[1].createdAt,
    dailySequence: 2,
    timeZone: "UTC",
  }));

  const nextBulkOrderResult = await sendJson(harness, "/api/portal/orders/bulk", {
    submissionId: "orders-workflow-0002",
    orders: [
      {
        orderId: "00003",
        patientId: "9001",
        patientName: "Portal Patient",
        provider: "Dr. Rivera",
        facilityName: "North Clinic",
        accessionPrefix: "RP",
        services: [
          {
            serviceName: "Respiratory Pathogens Panel",
          },
        ],
        status: "Pending",
      },
    ],
  });
  assert.equal(nextBulkOrderResult.response.status, 200);
  assert.equal(nextBulkOrderResult.payload.orders.length, 1);
  assert.equal(nextBulkOrderResult.payload.orders[0].accessionNo, buildAccessionNumber({
    prefix: "RP",
    createdAt: nextBulkOrderResult.payload.orders[0].createdAt,
    dailySequence: 3,
    timeZone: "UTC",
  }));

  const uploadLogResult = await sendJson(harness, "/api/portal/upload-log", {
    entries: [
      {
        ts: "2026-06-01T10:00:00.000Z",
        message: "Manual upload saved",
      },
    ],
  });
  assert.equal(uploadLogResult.response.status, 200);
  assert.equal(uploadLogResult.payload.registrations.length, 1);
  assert.equal(uploadLogResult.payload.orders.length, 3);
  assert.equal(uploadLogResult.payload.uploadResultsLog.length, 1);
});

test("repeated requisition submissions create only one registration and order", async (t) => {
  const harness = await startPortalHarness();
  t.after(async () => {
    await harness.close();
  });

  const registrationRequests = await Promise.all([
    sendJson(harness, "/api/portal/registrations", {
      submissionId: "registration-repeat-0001",
      registration: {
        patientId: "9100",
        firstName: "Repeat",
        lastName: "Patient",
        createdAt: "2026-08-27T10:00:00.000Z",
      },
    }),
    sendJson(harness, "/api/portal/registrations", {
      submissionId: "registration-repeat-0001",
      registration: {
        patientId: "9100",
        firstName: "Repeat",
        lastName: "Patient",
        createdAt: "2026-08-27T10:00:01.000Z",
      },
    }),
  ]);

  registrationRequests.forEach(({ response }) => assert.equal(response.status, 200));
  assert.deepEqual(
    registrationRequests.map(({ payload }) => payload.replayed).sort(),
    [false, true]
  );
  assert.equal(registrationRequests[0].payload.registration.createdAt, registrationRequests[1].payload.registration.createdAt);
  assert.equal(registrationRequests[0].payload.totalCount, 1);
  assert.equal(registrationRequests[1].payload.totalCount, 1);

  const reserved = await sendJson(harness, "/api/portal/order-ids", { count: 2 });
  assert.equal(reserved.response.status, 200);
  const orderRequests = await Promise.all(reserved.payload.orderIds.map((orderId) => sendJson(harness, "/api/portal/orders/bulk", {
    submissionId: "orders-repeat-0001",
    orders: [
      {
        orderId,
        patientId: "9100",
        patientName: "Repeat Patient",
        accessionPrefix: "RP",
        services: [{ serviceName: "Respiratory Pathogens Panel" }],
        status: "Pending",
      },
    ],
  })));

  orderRequests.forEach(({ response }) => assert.equal(response.status, 200));
  assert.deepEqual(
    orderRequests.map(({ payload }) => payload.replayed).sort(),
    [false, true]
  );
  assert.equal(orderRequests[0].payload.orders[0].orderId, orderRequests[1].payload.orders[0].orderId);

  const portalDataResponse = await fetch(`${harness.baseUrl}/api/portal/data`, {
    headers: { Cookie: harness.cookieJar.header() },
  });
  assert.equal(portalDataResponse.status, 200);
  const portalData = await portalDataResponse.json();
  assert.equal(portalData.registrations.length, 1);
  assert.equal(portalData.orders.length, 1);

  const auditResponse = await fetch(
    `${harness.baseUrl}/api/portal/orders/${encodeURIComponent(portalData.orders[0].orderId)}/audit-events`,
    { headers: { Cookie: harness.cookieJar.header() } }
  );
  assert.equal(auditResponse.status, 200);
  const auditPayload = await auditResponse.json();
  assert.equal(auditPayload.events.filter((event) => event.eventType === "order_created").length, 1);

  const laterRequisition = await sendJson(harness, "/api/portal/registrations", {
    submissionId: "registration-later-0002",
    registration: {
      patientId: "9100",
      firstName: "Repeat",
      lastName: "Patient",
      createdAt: "2026-08-28T10:00:00.000Z",
    },
  });
  assert.equal(laterRequisition.response.status, 200);
  assert.equal(laterRequisition.payload.replayed, false);
  assert.equal(laterRequisition.payload.totalCount, 2);
});
