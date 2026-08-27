const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCsv, filterRowsByOrderCreatedDate, getDateOneMonthEarlier, parseUsDate, DEFAULT_FIELD_KEYS, INSURANCE_FIELD_KEYS, EXPORT_FIELDS } = require("../assets/requisition-export.js");

test("requisition export starts with the five recommended fields", () => {
  assert.deepEqual(DEFAULT_FIELD_KEYS, ["accession", "orderCreatedDate", "collectionDate", "patientId", "patientName"]);
});

test("requisition export filters order creation dates inclusively", () => {
  const rows = [
    { order: { createdAt: "2026-06-01T08:15:00.000Z" } },
    { order: { createdAt: "2026-06-15T17:45:00.000Z" } },
    { order: { createdAt: "2026-07-01T09:00:00.000Z" } },
  ];
  assert.deepEqual(filterRowsByOrderCreatedDate(rows, "2026-06-01", "2026-06-15"), rows.slice(0, 2));
});

test("requisition export uses the app-time-zone date key shown to the user", () => {
  const row = {
    orderCreatedDateKey: "2026-05-31",
    order: { createdAt: "2026-06-01T01:15:00.000Z" },
  };
  assert.deepEqual(filterRowsByOrderCreatedDate([row], "2026-05-31", "2026-05-31"), [row]);
  assert.deepEqual(filterRowsByOrderCreatedDate([row], "2026-06-01", "2026-06-01"), []);
});

test("requisition export parses native calendar and legacy MM/DD/YYYY dates", () => {
  assert.equal(parseUsDate("2026-06-15"), "2026-06-15");
  assert.equal(parseUsDate("06/15/2026"), "2026-06-15");
  assert.equal(parseUsDate(""), "");
  assert.equal(parseUsDate("15/06/2026"), null);
  assert.equal(parseUsDate("02/30/2026"), null);
});

test("requisition export defaults from one calendar month earlier", () => {
  assert.equal(getDateOneMonthEarlier("2026-08-27"), "2026-07-27");
  assert.equal(getDateOneMonthEarlier("2026-03-31"), "2026-02-28");
  assert.equal(getDateOneMonthEarlier("2024-03-31"), "2024-02-29");
  assert.equal(getDateOneMonthEarlier("2026-01-30"), "2025-12-30");
});

test("requisition export formats calendar values consistently as MM/DD/YYYY", () => {
  const { formatExportDate } = require("../assets/requisition-export.js");
  assert.equal(formatExportDate("2026-07-27"), "07/27/2026");
});

test("requisition export excludes missing order creation dates only when a date filter is used", () => {
  const rows = [
    { order: { createdAt: "2026-06-10" } },
    { order: { createdAt: "" } },
    { order: {} },
  ];
  assert.deepEqual(filterRowsByOrderCreatedDate(rows, "2026-06-01", "2026-06-30"), rows.slice(0, 1));
  assert.deepEqual(filterRowsByOrderCreatedDate(rows, "", ""), rows);
});

test("requisition export creates escaped CSV with selected attributes", () => {
  const csv = buildCsv([{ accession: "A-1", collectionDate: "6/15/2026", firstName: "Jane", lastName: "Doe, MD", raw: { patientId: "P-7" }, order: { createdAt: "2026-06-14T13:30:00.000Z" } }], DEFAULT_FIELD_KEYS);
  assert.equal(csv, "Accession #,Order Creation Date,Sample Collection Date,Patient ID,Patient Name\r\nA-1,06/14/2026,6/15/2026,P-7,\"Jane Doe, MD\"");
});

test("requisition export includes the requested dates and all insurance detail columns", () => {
  const keys = EXPORT_FIELDS.map((field) => field.key);
  assert.ok(keys.includes("orderCreatedDate"));
  assert.ok(keys.includes("sampleReceivedDate"));
  assert.ok(keys.includes("reportPublishedDate"));
  assert.ok(keys.includes("panel"));
  assert.ok(keys.includes("icdCode"));
  assert.equal(INSURANCE_FIELD_KEYS.length, 15);
  assert.ok(keys.includes("allInsuranceDetails"));
});

test("requisition export includes unique panel names and ICD codes", () => {
  const row = {
    order: {
      services: [
        { serviceName: "Respiratory Panel", icdCodes: ["J069", "R509"] },
        { serviceName: "Respiratory Panel", icdCodes: ["R509", "Z1159"] },
      ],
    },
  };
  const csv = buildCsv([row], ["panel", "icdCode"]);
  assert.equal(csv, "Panel,ICD Code\r\nRespiratory Panel,\"J069, R509, Z1159\"");
});

test("all insurance detail selections export separate columns", () => {
  const row = { raw: { billingType: "Commercial", primaryInsurance: "Example Health" } };
  const csv = buildCsv([row], ["billingType", "primaryInsurance"]);
  assert.equal(csv, "Billing Type,Primary Insurance Provider\r\nCommercial,Example Health");
});
