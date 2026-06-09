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

test("patient update route persists edited patient details and linked order snapshots", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-route-test-"));
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
  process.env.SESSION_SECRET = "test-secret-for-patient-route";

  const serverPath = require.resolve("../server.js");
  delete require.cache[serverPath];
  const { startServer, portalStore } = require("../server.js");

  portalStore.upsertRegistration({
    patientId: "9001",
    firstName: "Before",
    lastName: "Patient",
    phone: "5550001111",
    provider: "Original Provider",
    facilityName: "Original Facility",
    createdAt: "2026-04-01T10:00:00.000Z",
  });
  portalStore.upsertOrders([
    {
      orderId: "00001",
      patientId: "9001",
      patientName: "Before Patient",
      patientDob: "1980-01-01",
      provider: "Original Provider",
      facilityName: "Original Facility",
      status: "Pending",
      createdAt: "2026-04-01T10:05:00.000Z",
      updatedAt: "2026-04-01T10:05:00.000Z",
    },
  ]);

  const server = await startServer(0);
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    delete require.cache[serverPath];
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const cookieJar = createCookieJar();

  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf-token`);
  cookieJar.merge(csrfResponse.headers);
  const csrfPayload = await csrfResponse.json();
  assert.ok(csrfPayload.csrfToken);

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
  assert.equal(loginResponse.status, 200);
  const loginPayload = await loginResponse.json();
  assert.ok(loginPayload.authenticated);
  assert.ok(loginPayload.csrfToken);

  const updateResponse = await fetch(`${baseUrl}/api/portal/patients/9001`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieJar.header(),
      "x-csrf-token": loginPayload.csrfToken,
    },
    body: JSON.stringify({
      patient: {
        firstName: "After",
        middleName: "Route",
        lastName: "Patient",
        dob: "1992-03-14",
        phone: "5557776666",
        provider: "Updated Provider",
        facilityName: "Updated Facility",
        primaryInsurance: "Acme Health",
        patientType: "Existing",
      },
    }),
  });

  assert.equal(updateResponse.status, 200);
  const updatePayload = await updateResponse.json();
  assert.equal(updatePayload.patient.firstName, "After");
  assert.equal(updatePayload.patient.phone, "5557776666");
  assert.equal(updatePayload.patient.primaryInsurance, "Acme Health");
  assert.equal(updatePayload.updatedRegistrations, 1);
  assert.equal(updatePayload.updatedOrders, 1);

  const updatedRegistration = updatePayload.registrations.find((record) => String(record.patientId) === "9001");
  assert.ok(updatedRegistration);
  assert.equal(updatedRegistration.firstName, "After");
  assert.equal(updatedRegistration.middleName, "Route");
  assert.equal(updatedRegistration.phone, "5557776666");
  assert.equal(updatedRegistration.patientType, "Existing");

  const updatedOrder = updatePayload.orders.find((record) => String(record.orderId) === "00001");
  assert.ok(updatedOrder);
  assert.equal(updatedOrder.patientName, "After Route Patient");
  assert.equal(updatedOrder.patientDob, "1992-03-14");
  assert.equal(updatedOrder.provider, "Updated Provider");
  assert.equal(updatedOrder.facilityName, "Updated Facility");
});
