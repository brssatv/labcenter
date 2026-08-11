const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCsv, filterRowsByDate, DEFAULT_FIELD_KEYS, INSURANCE_FIELD_KEYS, EXPORT_FIELDS } = require("../assets/requisition-export.js");

test("requisition export starts with the four requested fields", () => {
  assert.deepEqual(DEFAULT_FIELD_KEYS, ["accession", "collectionDate", "patientId", "patientName"]);
});

test("requisition export filters collection dates inclusively", () => {
  const rows = [{ collectionDateKey: "2026-06-01" }, { collectionDateKey: "2026-06-15" }, { collectionDateKey: "2026-07-01" }];
  assert.deepEqual(filterRowsByDate(rows, "2026-06-01", "2026-06-15"), rows.slice(0, 2));
});

test("requisition export creates escaped CSV with selected attributes", () => {
  const csv = buildCsv([{ accession: "A-1", collectionDate: "6/15/2026", firstName: "Jane", lastName: "Doe, MD", raw: { patientId: "P-7" } }], DEFAULT_FIELD_KEYS);
  assert.equal(csv, "Accession #,Sample Collection Date,Patient ID,Patient Name\r\nA-1,6/15/2026,P-7,\"Jane Doe, MD\"");
});

test("requisition export includes the requested dates and all insurance detail columns", () => {
  const keys = EXPORT_FIELDS.map((field) => field.key);
  assert.ok(keys.includes("sampleReceivedDate"));
  assert.ok(keys.includes("reportPublishedDate"));
  assert.equal(INSURANCE_FIELD_KEYS.length, 15);
  assert.ok(keys.includes("allInsuranceDetails"));
});

test("all insurance detail selections export separate columns", () => {
  const row = { raw: { billingType: "Commercial", primaryInsurance: "Example Health" } };
  const csv = buildCsv([row], ["billingType", "primaryInsurance"]);
  assert.equal(csv, "Billing Type,Primary Insurance Provider\r\nCommercial,Example Health");
});
