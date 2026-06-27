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

async function startFacilityHarness(seedFacilityData = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-facility-route-test-"));
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
  process.env.SESSION_SECRET = "test-secret-for-facility-routes";

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
  assert.ok(loginPayload.csrfToken);

  return {
    baseUrl,
    cookieJar,
    csrfToken: loginPayload.csrfToken,
    dataDir,
    readFacilityData() {
      return JSON.parse(fs.readFileSync(facilityPath, "utf8"));
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

async function postJson(harness, routePath, body, method = "POST") {
  const response = await fetch(`${harness.baseUrl}${routePath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}

function mockNpiRegistryFetch(t, payload) {
  const originalFetch = global.fetch;
  global.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : String(input?.url || "");

    if (url.startsWith("https://npiregistry.cms.hhs.gov/api/?")) {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    return originalFetch(input, init);
  };

  t.after(() => {
    global.fetch = originalFetch;
  });
}

test("facility data route sanitizes portal and encrypted report secrets for doctor sessions", async (t) => {
  const harness = await startFacilityHarness({
    accounts: [
      {
        id: "200001",
        name: "North Clinic",
        portal_password_hash: "account-secret-hash",
        portal: {
          username: "north.portal",
          passwordHash: "portal-object-secret",
          accessType: "report_view",
        },
      },
    ],
    providers: [
      {
        provider_id: "300001",
        provider_name: "Rivera",
        validator_name: "Dr. Rivera",
        portal_password_hash: "provider-secret-hash",
        encrypted_reports_password: "zipper",
        portal: {
          username: "rivera.portal",
          passwordHash: "provider-portal-secret",
          accessType: "report_view_order",
        },
        provider_configuration: {
          encryptedReportsPassword: "zipper",
          sendFax: true,
        },
      },
    ],
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.baseUrl}/api/facility/data`, {
    headers: {
      Cookie: harness.cookieJar.header(),
    },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.accounts[0].portal_password_hash, undefined);
  assert.equal(payload.accounts[0].portal.passwordHash, undefined);
  assert.equal(payload.accounts[0].portal.passwordConfigured, true);
  assert.equal(payload.accounts[0].portal_has_password, true);
  assert.equal(payload.providers[0].encrypted_reports_password, undefined);
  assert.equal(payload.providers[0].provider_configuration.encryptedReportsPassword, undefined);
  assert.equal(payload.providers[0].provider_configuration.encryptedReportsPasswordConfigured, true);
  assert.equal(payload.providers[0].encrypted_reports_password_configured, true);
});

test("facility provider lookup route maps CMS NPI registry details into provider fields", async (t) => {
  mockNpiRegistryFetch(t, {
    result_count: 1,
    results: [
      {
        number: "1720466444",
        enumeration_type: "NPI-1",
        basic: {
          first_name: "CHRISTOPHER",
          middle_name: "ANTHONY",
          last_name: "MONSOUR",
          name_prefix: "Dr.",
          credential: "MD",
        },
        addresses: [
          {
            address_1: "1600 SW ARCHER RD",
            address_2: "ROOM 4120",
            address_purpose: "LOCATION",
            city: "GAINESVILLE",
            state: "FL",
            postal_code: "32610",
            telephone_number: "352-265-0651",
          },
          {
            address_1: "PO BOX 100277",
            address_purpose: "MAILING",
            city: "GAINESVILLE",
            state: "FL",
            postal_code: "326100277",
          },
        ],
        taxonomies: [
          {
            code: "207R00000X",
            desc: "Internal Medicine",
            primary: true,
          },
        ],
      },
    ],
  });

  const harness = await startFacilityHarness();
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.baseUrl}/api/facility/providers/lookup?npi=1720466444`, {
    headers: {
      Cookie: harness.cookieJar.header(),
    },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.provider, {
    npi: "1720466444",
    designation: "Dr.",
    providerName: "CHRISTOPHER ANTHONY MONSOUR",
    displayName: "Dr. CHRISTOPHER ANTHONY MONSOUR",
    contactNo: "352-265-0651",
    faxNumber: "",
    speciality: "Internal Medicine",
    mailingAddress: "PO BOX 100277",
    city: "GAINESVILLE",
    state: "FL",
    zipcode: "32610-0277",
    credential: "MD",
    enumerationType: "NPI-1",
    source: "CMS NPI Registry",
  });
});

test("facility provider lookup route validates NPI length", async (t) => {
  const harness = await startFacilityHarness();
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.baseUrl}/api/facility/providers/lookup?npi=1234`, {
    headers: {
      Cookie: harness.cookieJar.header(),
    },
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, "Provider NPI must be 10 digits.");
});

test("facility provider lookup route returns not found when CMS has no matching result", async (t) => {
  mockNpiRegistryFetch(t, {
    result_count: 0,
    results: [],
  });

  const harness = await startFacilityHarness();
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.baseUrl}/api/facility/providers/lookup?npi=1234567890`, {
    headers: {
      Cookie: harness.cookieJar.header(),
    },
  });

  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.error, "No provider was found for NPI 1234567890.");
});

test("facility account create route normalizes portal credentials and persists the new account", async (t) => {
  const harness = await startFacilityHarness();
  t.after(async () => {
    await harness.close();
  });

  const { response, payload } = await postJson(harness, "/api/facility/accounts", {
    basicInfo: {
      accountName: "North Clinic",
      accountCode: "NC-1",
      contact: "352-555-0101",
      email: "north@example.com",
    },
    paymentConfigurations: {
      paymentMode: "CASH",
      creditLimit: "1000",
    },
    loginAccess: {
      accessType: "report_view",
      username: "  Portal.User  ",
      password: "Password123",
      defaultLanguage: "Spanish",
      whatsappEnabled: true,
      privileges: {
        orders: true,
      },
    },
  });

  assert.equal(response.status, 201);
  assert.equal(payload.account.name, "North Clinic");
  assert.equal(payload.account.portal_username, "portal.user");
  assert.equal(payload.account.portal_enabled, "Yes");
  assert.equal(payload.account.portal_default_language, "Spanish");

  const stored = harness.readFacilityData();
  assert.equal(stored.accounts.length, 1);
  assert.equal(stored.accounts[0].name, "North Clinic");
  assert.equal(stored.accounts[0].portal_username, "portal.user");
  assert.equal(stored.accounts[0].portal?.username, "portal.user");
  assert.notEqual(stored.accounts[0].portal_password_hash, "");
  assert.notEqual(stored.accounts[0].portal_password_hash, "Password123");
});

test("facility account update route preserves the existing portal password hash when password is omitted", async (t) => {
  const harness = await startFacilityHarness();
  t.after(async () => {
    await harness.close();
  });

  const createResult = await postJson(harness, "/api/facility/accounts", {
    basicInfo: {
      accountName: "North Clinic",
      accountCode: "NC-1",
    },
    loginAccess: {
      accessType: "report_view",
      username: "north.portal",
      password: "Password123",
    },
  });
  assert.equal(createResult.response.status, 201);

  const original = harness.readFacilityData().accounts[0];
  const originalHash = original.portal_password_hash;

  const updateResult = await postJson(harness, `/api/facility/accounts/${original.id}`, {
    basicInfo: {
      accountName: "North Clinic Updated",
      notes: "Updated account note",
    },
    loginAccess: {
      accessType: "report_view",
      username: "north.portal",
    },
  }, "PUT");

  assert.equal(updateResult.response.status, 200);
  const stored = harness.readFacilityData().accounts[0];
  assert.equal(stored.name, "North Clinic Updated");
  assert.equal(stored.notes, "Updated account note");
  assert.equal(stored.portal_password_hash, originalHash);
  assert.equal(stored.portal?.passwordHash, original.portal?.passwordHash);
});

test("facility provider create route persists publish settings and normalized portal login", async (t) => {
  const harness = await startFacilityHarness();
  t.after(async () => {
    await harness.close();
  });

  const { response, payload } = await postJson(harness, "/api/facility/providers", {
    providerInfo: {
      designation: "Dr.",
      providerName: "Rivera",
      displayName: "Dr. Maria Rivera",
      faxNumber: "352-565-4554",
      email: "rivera@example.com",
    },
    configuration: {
      source: "Referral Network",
      accounts: "200001",
      encryptedReportsPassword: "zipper",
      sendEmail: true,
      sendFax: true,
    },
    signature: {
      fileName: "rivera-signature.png",
    },
    loginAccess: {
      accessType: "report_view_order",
      username: " Provider.User ",
      password: "Password123",
      defaultLanguage: "Spanish",
    },
  });

  assert.equal(response.status, 201);
  assert.equal(payload.provider.validator_name, "Dr. Rivera");
  assert.equal(payload.provider.portal_username, "provider.user");
  assert.equal(payload.provider.send_fax, true);
  assert.equal(payload.provider.signature_file_name, "rivera-signature.png");

  const stored = harness.readFacilityData();
  assert.equal(stored.providers.length, 1);
  assert.equal(stored.providers[0].portal_username, "provider.user");
  assert.equal(stored.providers[0].business_source, "Referral Network");
  assert.equal(stored.providers[0].provider_configuration?.encryptedReportsPassword, "zipper");
  assert.equal(stored.providers[0].send_fax, true);
  assert.notEqual(stored.providers[0].portal_password_hash, "");
});

test("facility provider update route preserves existing portal password and sendFax setting when omitted", async (t) => {
  const harness = await startFacilityHarness();
  t.after(async () => {
    await harness.close();
  });

  const createResult = await postJson(harness, "/api/facility/providers", {
    providerInfo: {
      designation: "Dr.",
      providerName: "Rivera",
      displayName: "Dr. Maria Rivera",
    },
    configuration: {
      source: "Original Source",
      sendFax: true,
    },
    loginAccess: {
      accessType: "report_view_order",
      username: "provider.user",
      password: "Password123",
    },
  });
  assert.equal(createResult.response.status, 201);

  const original = harness.readFacilityData().providers[0];
  const originalHash = original.portal_password_hash;
  const originalSendFax = original.send_fax;

  const updateResult = await postJson(harness, `/api/facility/providers/${original.provider_id}`, {
    providerInfo: {
      displayName: "Dr. M. Rivera",
    },
    configuration: {
      source: "Referral Network",
    },
    loginAccess: {
      accessType: "report_view_order",
      username: "provider.user",
    },
  }, "PUT");

  assert.equal(updateResult.response.status, 200);
  const stored = harness.readFacilityData().providers[0];
  assert.equal(stored.display_name, "Dr. M. Rivera");
  assert.equal(stored.business_source, "Referral Network");
  assert.equal(stored.send_fax, originalSendFax);
  assert.equal(stored.portal_password_hash, originalHash);
  assert.equal(stored.portal?.passwordHash, original.portal?.passwordHash);
});
