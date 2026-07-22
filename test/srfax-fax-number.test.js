const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeSrfaxRecipientFaxDigits } = require("../server/features/report-publishing");

test("SRFax normalization prepends country code to ten-digit numbers", () => {
  assert.equal(normalizeSrfaxRecipientFaxDigits("555-444-1212"), "15554441212");
});

test("SRFax normalization preserves valid eleven-digit numbers", () => {
  assert.equal(normalizeSrfaxRecipientFaxDigits("1 (555) 444-1212"), "15554441212");
});

test("SRFax normalization rejects invalid fax lengths", () => {
  assert.throws(
    () => normalizeSrfaxRecipientFaxDigits("555-1212"),
    /valid 10-digit U\.S\. or Canadian number/
  );
});
