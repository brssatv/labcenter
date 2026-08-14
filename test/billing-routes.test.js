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
        const [pair] = String(cookie || "").split(";");
        const separatorIndex = pair.indexOf("=");
        if (separatorIndex <= 0) return;
        jar.set(pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1));
      });
    },
    header() {
      return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
    },
  };
}

async function fetchCsrf(baseUrl, cookieJar) {
  const response = await fetch(`${baseUrl}/api/auth/csrf-token`, {
    headers: cookieJar.header() ? { Cookie: cookieJar.header() } : {},
  });
  cookieJar.merge(response.headers);
  assert.equal(response.status, 200);
  return (await response.json()).csrfToken;
}

async function requestJson(baseUrl, routePath, { cookieJar, csrfToken = "", method = "GET", body } = {}) {
  const headers = {};
  if (cookieJar?.header()) headers.Cookie = cookieJar.header();
  if (csrfToken) headers["x-csrf-token"] = csrfToken;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  cookieJar?.merge(response.headers);
  const payload = response.status === 204 ? {} : await response.json();
  return { response, payload };
}

async function startBillingHarness() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-billing-route-test-"));
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
  process.env.SESSION_SECRET = "test-secret-for-billing-routes";

  const serverPath = require.resolve("../server.js");
  delete require.cache[serverPath];
  const { startServer, portalStore } = require("../server.js");
  const server = await startServer(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    baseUrl,
    dataDir,
    portalStore,
    async loginAdmin() {
      const cookieJar = createCookieJar();
      const csrfToken = await fetchCsrf(baseUrl, cookieJar);
      const result = await requestJson(baseUrl, "/api/auth/login", {
        cookieJar,
        csrfToken,
        method: "POST",
        body: { identifier: "admin@clinic.local", password: "ChangeMeNow!123" },
      });
      assert.equal(result.response.status, 200);
      return { cookieJar, csrfToken: result.payload.csrfToken };
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

test("admins can create and update isolated billing portal users", async (t) => {
  const harness = await startBillingHarness();
  t.after(() => harness.close());

  const anonymousList = await requestJson(harness.baseUrl, "/api/billers");
  assert.equal(anonymousList.response.status, 401);

  const admin = await harness.loginAdmin();
  const created = await requestJson(harness.baseUrl, "/api/billers", {
    ...admin,
    method: "POST",
    body: {
      fullName: "Alex Morgan",
      company: "Clear Claims LLC",
      email: "alex@example.com",
      phone: "555-0105",
      username: "alex.billing",
      password: "StrongPass!123",
      facilityIds: ["10001", "10002", "10001"],
      status: "active",
      notes: "Primary billing contact",
    },
  });
  assert.equal(created.response.status, 201);
  assert.ok(created.payload.biller.id);
  assert.equal(created.payload.biller.username, "alex.billing");
  assert.deepEqual(created.payload.biller.facilityIds, ["10001", "10002"]);
  assert.equal(created.payload.biller.passwordConfigured, true);
  assert.equal(created.payload.biller.passwordHash, undefined);

  const persisted = JSON.parse(fs.readFileSync(path.join(harness.dataDir, "billers.json"), "utf8"));
  assert.match(persisted.billers[0].passwordHash, /^scrypt\$/);
  assert.notEqual(persisted.billers[0].passwordHash, "StrongPass!123");

  const duplicate = await requestJson(harness.baseUrl, "/api/billers", {
    ...admin,
    method: "POST",
    body: {
      fullName: "Duplicate User",
      username: "alex.billing",
      password: "AnotherPass!123",
    },
  });
  assert.equal(duplicate.response.status, 409);

  const updated = await requestJson(harness.baseUrl, `/api/billers/${created.payload.biller.id}`, {
    ...admin,
    method: "PUT",
    body: {
      ...created.payload.biller,
      company: "Clear Claims Group",
      password: "",
    },
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.payload.biller.company, "Clear Claims Group");
  assert.equal(updated.payload.biller.passwordConfigured, true);

  const portalPage = await fetch(`${harness.baseUrl}/billing`);
  assert.equal(portalPage.status, 200);
  assert.match(await portalPage.text(), /id="billing-username"/);
});

test("billing sessions can read only their billing profile and inactive users are blocked", async (t) => {
  const harness = await startBillingHarness();
  t.after(() => harness.close());
  const admin = await harness.loginAdmin();

  const created = await requestJson(harness.baseUrl, "/api/billers", {
    ...admin,
    method: "POST",
    body: {
      fullName: "Jordan Lee",
      company: "Northstar Billing",
      email: "jordan@example.com",
      username: "jordan.billing",
      password: "BillingPass!123",
      facilityIds: ["20001"],
      status: "active",
    },
  });
  assert.equal(created.response.status, 201);

  const billerCookieJar = createCookieJar();
  const billerCsrf = await fetchCsrf(harness.baseUrl, billerCookieJar);
  const login = await requestJson(harness.baseUrl, "/api/billing-auth/login", {
    cookieJar: billerCookieJar,
    csrfToken: billerCsrf,
    method: "POST",
    body: { username: "jordan.billing", password: "BillingPass!123" },
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.payload.billerUser.role, "biller");
  assert.deepEqual(login.payload.billerUser.facilityIds, ["20001"]);

  const profile = await requestJson(harness.baseUrl, "/api/billing/profile", {
    cookieJar: billerCookieJar,
  });
  assert.equal(profile.response.status, 200);
  assert.equal(profile.payload.biller.fullName, "Jordan Lee");
  assert.equal(profile.payload.biller.notes, undefined);
  assert.equal(profile.payload.biller.passwordHash, undefined);

  const clinicalData = await requestJson(harness.baseUrl, "/api/portal/data", {
    cookieJar: billerCookieJar,
  });
  assert.equal(clinicalData.response.status, 401);

  const disabled = await requestJson(harness.baseUrl, `/api/billers/${created.payload.biller.id}`, {
    ...admin,
    method: "PUT",
    body: {
      ...created.payload.biller,
      status: "inactive",
      password: "",
    },
  });
  assert.equal(disabled.response.status, 200);

  const blockedProfile = await requestJson(harness.baseUrl, "/api/billing/profile", {
    cookieJar: billerCookieJar,
  });
  assert.equal(blockedProfile.response.status, 401);

  const nextCookieJar = createCookieJar();
  const nextCsrf = await fetchCsrf(harness.baseUrl, nextCookieJar);
  const blockedLogin = await requestJson(harness.baseUrl, "/api/billing-auth/login", {
    cookieJar: nextCookieJar,
    csrfToken: nextCsrf,
    method: "POST",
    body: { username: "jordan.billing", password: "BillingPass!123" },
  });
  assert.equal(blockedLogin.response.status, 401);
});

test("billing users can view final reports and completed requisitions only for assigned facilities", async (t) => {
  const harness = await startBillingHarness();
  t.after(() => harness.close());

  fs.writeFileSync(
    path.join(harness.dataDir, "facility.json"),
    `${JSON.stringify({
      importedAt: null,
      sourceFiles: {},
      accounts: [
        { id: "20001", account_code: "FAC-A", name: "Assigned Clinic" },
        { id: "20002", account_code: "FAC-B", name: "Restricted Clinic" },
      ],
      providers: [],
    }, null, 2)}\n`,
    "utf8"
  );

  const assignedKey = "generated-reports/final/00001/assigned.pdf";
  const restrictedKey = "generated-reports/final/00002/restricted.pdf";
  harness.portalStore.upsertOrders([
    {
      orderId: "00001",
      accessionNo: "ACC-1",
      patientId: "PAT-1",
      patientName: "Assigned Patient",
      accountId: "20001",
      facilityName: "Assigned Clinic",
      provider: "Dr. Assigned",
      status: "Complete",
      createdAt: "2026-08-01T11:00:00.000Z",
      completedAt: "2026-08-01T12:00:00.000Z",
      services: [{ serviceName: "Respiratory Panel", icdCodes: ["Z01.89"] }],
      generatedReports: {
        final: {
          bucket: "local",
          storageType: "local",
          key: assignedKey,
          fileName: "Order_00001_Final_Report.pdf",
          generatedAt: "2026-08-01T12:00:00.000Z",
        },
      },
    },
    {
      orderId: "00002",
      accessionNo: "ACC-2",
      patientId: "PAT-2",
      patientName: "Restricted Patient",
      accountId: "20002",
      facilityName: "Restricted Clinic",
      provider: "Dr. Restricted",
      status: "Complete",
      createdAt: "2026-08-02T11:00:00.000Z",
      completedAt: "2026-08-02T12:00:00.000Z",
      generatedReports: {
        final: {
          bucket: "local",
          storageType: "local",
          key: restrictedKey,
          fileName: "Order_00002_Final_Report.pdf",
          generatedAt: "2026-08-02T12:00:00.000Z",
        },
      },
    },
    {
      orderId: "00003",
      patientId: "PAT-3",
      patientName: "Pending Patient",
      accountId: "20001",
      facilityName: "Assigned Clinic",
      provider: "Dr. Assigned",
      status: "Pending",
    },
  ]);

  harness.portalStore.upsertRegistration({
    patientId: "PAT-1",
    firstName: "Assigned <Patient>",
    lastName: "Example",
    dob: "1990-01-02",
    facilityName: "Assigned Clinic",
    provider: "Dr. Assigned",
    billingType: "Insurance",
    primaryInsurance: "Example Health",
    primaryMemberPolicy: "MEM-100",
    collectionDate: "2026-08-01",
    collectionTime: "10:30",
    specimenTypeSwab: "Swab",
    specimenRetentionConsent: true,
    communicationsConsent: false,
    acknowledgmentSignedBy: "Assigned Patient",
    acknowledgmentRelationship: "Self",
    acknowledgmentSignedAt: "2026-08-01T10:45:00.000Z",
    createdAt: "2026-08-01T10:55:00.000Z",
  });

  for (const [storageKey, contents] of [[assignedKey, "%PDF-assigned"], [restrictedKey, "%PDF-restricted"]]) {
    const absolutePath = path.join(harness.dataDir, storageKey);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, contents, "utf8");
  }

  const admin = await harness.loginAdmin();
  const created = await requestJson(harness.baseUrl, "/api/billers", {
    ...admin,
    method: "POST",
    body: {
      fullName: "Report Biller",
      username: "report.billing",
      password: "BillingPass!123",
      allFacilities: false,
      facilityIds: ["20001"],
      status: "active",
    },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.biller.allFacilities, false);

  const billerCookieJar = createCookieJar();
  const billerCsrf = await fetchCsrf(harness.baseUrl, billerCookieJar);
  const login = await requestJson(harness.baseUrl, "/api/billing-auth/login", {
    cookieJar: billerCookieJar,
    csrfToken: billerCsrf,
    method: "POST",
    body: { username: "report.billing", password: "BillingPass!123" },
  });
  assert.equal(login.response.status, 200);

  const reports = await requestJson(harness.baseUrl, "/api/billing/reports", { cookieJar: billerCookieJar });
  assert.equal(reports.response.status, 200);
  assert.deepEqual(reports.payload.reports.map((report) => report.orderId), ["00001"]);
  assert.equal(reports.payload.reports[0].requisitionAvailable, true);

  const assignedReport = await fetch(`${harness.baseUrl}/api/orders/00001/final-report-pdf`, {
    headers: { Cookie: billerCookieJar.header() },
  });
  assert.equal(assignedReport.status, 200);
  assert.equal(await assignedReport.text(), "%PDF-assigned");

  const restrictedReport = await fetch(`${harness.baseUrl}/api/orders/00002/final-report-pdf`, {
    headers: { Cookie: billerCookieJar.header() },
  });
  assert.equal(restrictedReport.status, 404);

  const assignedRequisition = await fetch(`${harness.baseUrl}/orders/00001/requisition-print`, {
    headers: { Cookie: billerCookieJar.header() },
  });
  assert.equal(assignedRequisition.status, 200);
  assert.match(assignedRequisition.headers.get("content-type") || "", /^text\/html/);
  const requisitionHtml = await assignedRequisition.text();
  assert.match(requisitionHtml, /Completed Requisition/);
  assert.match(requisitionHtml, /Assigned &lt;Patient&gt; Example/);
  assert.doesNotMatch(requisitionHtml, /Assigned <Patient>/);
  assert.match(requisitionHtml, /Respiratory Panel/);
  assert.match(requisitionHtml, /data-print-requisition/);
  assert.match(requisitionHtml, /Respect · Choice · Privacy/);
  assert.match(requisitionHtml, /Patient Acknowledgment/);
  assert.match(requisitionHtml, /Specimen stewardship/);
  assert.match(requisitionHtml, /Communication choice/);
  assert.match(requisitionHtml, /data-consent-choice="specimen-retention-agree" aria-checked="true"/);
  assert.match(requisitionHtml, /data-consent-choice="communications-decline" aria-checked="true"/);
  assert.match(requisitionHtml, /Signature of patient or authorized representative/);

  const restrictedRequisition = await fetch(`${harness.baseUrl}/orders/00002/requisition-print`, {
    headers: { Cookie: billerCookieJar.header() },
  });
  assert.equal(restrictedRequisition.status, 404);

  const incompleteRequisition = await fetch(`${harness.baseUrl}/orders/00003/requisition-print`, {
    headers: { Cookie: billerCookieJar.header() },
  });
  assert.equal(incompleteRequisition.status, 404);

  const allFacilities = await requestJson(harness.baseUrl, `/api/billers/${created.payload.biller.id}`, {
    ...admin,
    method: "PUT",
    body: {
      ...created.payload.biller,
      password: "",
      allFacilities: true,
      facilityIds: ["20001"],
    },
  });
  assert.equal(allFacilities.response.status, 200);
  assert.equal(allFacilities.payload.biller.allFacilities, true);
  assert.deepEqual(allFacilities.payload.biller.facilityIds, []);

  const allReports = await requestJson(harness.baseUrl, "/api/billing/reports", { cookieJar: billerCookieJar });
  assert.deepEqual(allReports.payload.reports.map((report) => report.orderId), ["00002", "00001"]);

  const newlyAllowedReport = await fetch(`${harness.baseUrl}/api/orders/00002/final-report-pdf`, {
    headers: { Cookie: billerCookieJar.header() },
  });
  assert.equal(newlyAllowedReport.status, 200);

  const newlyAllowedRequisition = await fetch(`${harness.baseUrl}/orders/00002/requisition-print`, {
    headers: { Cookie: billerCookieJar.header() },
  });
  assert.equal(newlyAllowedRequisition.status, 200);
  const newlyAllowedRequisitionHtml = await newlyAllowedRequisition.text();
  assert.match(newlyAllowedRequisitionHtml, /data-consent-choice="specimen-retention-agree" aria-checked="false"/);
  assert.match(newlyAllowedRequisitionHtml, /data-consent-choice="communications-agree" aria-checked="false"/);

  const legacyRequisitionUrl = await fetch(`${harness.baseUrl}/api/billing/orders/00001/requisition-print`, {
    headers: { Cookie: billerCookieJar.header() },
  });
  assert.equal(legacyRequisitionUrl.status, 200);

  const clinicalData = await requestJson(harness.baseUrl, "/api/portal/data", { cookieJar: billerCookieJar });
  assert.equal(clinicalData.response.status, 401);
});
