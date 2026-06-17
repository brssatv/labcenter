const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createPortalStore } = require("../lib/portal-store");

function createTempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-store-test-"));
}

test("portal store can list and replace registrations by patient id", () => {
  const dataDir = createTempDataDir();
  const store = createPortalStore({ dataDir });

  store.upsertRegistration({
    patientId: "9001",
    firstName: "Alpha",
    lastName: "Patient",
    phone: "5550000001",
    provider: "Dr. One",
    facilityName: "Lab A",
    createdAt: "2026-04-10T10:00:00.000Z",
  });
  store.upsertRegistration({
    patientId: "9001",
    firstName: "Alpha",
    lastName: "Patient",
    phone: "5550000002",
    provider: "Dr. One",
    facilityName: "Lab A",
    createdAt: "2026-04-11T10:00:00.000Z",
  });
  store.upsertRegistration({
    patientId: "9002",
    firstName: "Bravo",
    lastName: "Patient",
    phone: "5550000003",
    provider: "Dr. Two",
    facilityName: "Lab B",
    createdAt: "2026-04-12T10:00:00.000Z",
  });

  const matches = store.listRegistrationsByPatientId("9001");
  assert.equal(matches.length, 2);
  assert.ok(matches[0].recordKey);
  assert.ok(matches[1].recordKey);
  assert.equal(matches[0].record.createdAt, "2026-04-11T10:00:00.000Z");
  assert.equal(matches[1].record.createdAt, "2026-04-10T10:00:00.000Z");

  const updated = store.replaceRegistrations(
    matches.map((entry) => ({
      recordKey: entry.recordKey,
      record: {
        ...entry.record,
        firstName: "Updated",
        phone: "5559998888",
      },
    }))
  );

  assert.equal(updated.length, 2);
  assert.equal(store.countRegistrations(), 3);

  const refreshed = store.listRegistrationsByPatientId("9001");
  assert.equal(refreshed.length, 2);
  assert.deepEqual(
    [...new Set(refreshed.map((entry) => entry.record.firstName))],
    ["Updated"]
  );
  assert.deepEqual(
    [...new Set(refreshed.map((entry) => entry.record.phone))],
    ["5559998888"]
  );
});

test("portal store reserves accession sequences independently per business day", () => {
  const dataDir = createTempDataDir();
  const store = createPortalStore({ dataDir });

  const firstBatch = store.reserveAccessionSequences([
    { createdAt: "2026-06-16T08:00:00.000Z" },
    { createdAt: "2026-06-16T09:00:00.000Z" },
  ], { timeZone: "UTC" });
  assert.deepEqual(firstBatch.map((entry) => entry.sequence), [1, 2]);

  const secondBatch = store.reserveAccessionSequences([
    { createdAt: "2026-06-17T00:01:00.000Z" },
    { createdAt: "2026-06-16T10:00:00.000Z" },
  ], { timeZone: "UTC" });
  assert.deepEqual(secondBatch.map((entry) => entry.sequence), [1, 3]);
});
