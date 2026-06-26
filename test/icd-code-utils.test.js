const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildIcdCatalogIndex,
  formatIcdCode,
  matchesIcdSearch,
  normalizeIcdCode,
  normalizeIcdCodeList,
} = require("../assets/icd-code-utils");

test("ICD utilities normalize to canonical storage and dotted display", () => {
  assert.equal(normalizeIcdCode("n39.0"), "N390");
  assert.equal(normalizeIcdCode(" N39.0 urinary tract infection "), "N390");
  assert.equal(formatIcdCode("N390"), "N39.0");
  assert.deepEqual(normalizeIcdCodeList(["n39.0", "N390", " z87.440 "]), ["N390", "Z87440"]);
});

test("ICD utilities match searches with or without decimals", () => {
  const record = buildIcdCatalogIndex([
    { code: "N390", description: "Urinary tract infection, site not specified" },
  ]).entries[0];

  assert.equal(matchesIcdSearch(record, "N39.0"), true);
  assert.equal(matchesIcdSearch(record, "N390"), true);
  assert.equal(matchesIcdSearch(record, "urinary tract infection"), true);
  assert.equal(matchesIcdSearch(record, "A41.9"), false);
});
