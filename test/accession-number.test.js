const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAccessionCounterName,
  buildAccessionNumber,
  resolveAccessionPrefix,
  splitAccessionSequence,
} = require("../lib/accession-number");

test("accession numbering formats shared daily sequences with letter rollover", () => {
  assert.deepEqual(splitAccessionSequence(1), { seriesLabel: "A", serial: "01" });
  assert.deepEqual(splitAccessionSequence(99), { seriesLabel: "A", serial: "99" });
  assert.deepEqual(splitAccessionSequence(100), { seriesLabel: "B", serial: "01" });
  assert.deepEqual(splitAccessionSequence(2574), { seriesLabel: "Z", serial: "99" });
  assert.deepEqual(splitAccessionSequence(2575), { seriesLabel: "AA", serial: "01" });
});

test("accession numbers use MMDDYY and timezone-aware day keys", () => {
  const createdAt = "2026-06-16T06:30:00.000Z";
  assert.equal(
    buildAccessionCounterName(createdAt, { timeZone: "UTC" }),
    "accession_sequence:2026-06-16"
  );
  assert.equal(
    buildAccessionCounterName(createdAt, { timeZone: "America/Vancouver" }),
    "accession_sequence:2026-06-15"
  );
  assert.equal(
    buildAccessionNumber({
      prefix: "EY",
      createdAt: "2026-06-16T15:45:00.000Z",
      dailySequence: 1,
      timeZone: "UTC",
    }),
    "EY061626A01"
  );
});

test("accession prefix resolution prefers explicit prefixes and falls back to panel mappings", () => {
  assert.equal(resolveAccessionPrefix({ explicitPrefix: " ey " }), "EY");
  assert.equal(resolveAccessionPrefix({ serviceLine: { panelIds: ["gastrointestinal-panel"] } }), "GI");
  assert.equal(resolveAccessionPrefix({ serviceLine: { panelIds: ["uti-pcr-panel"] } }), "UU");
  assert.equal(resolveAccessionPrefix({ serviceLine: { serviceName: "Eye Panel" } }), "EY");
  assert.equal(resolveAccessionPrefix({ serviceLine: { serviceName: "Unknown Panel" } }), "GN");
});
