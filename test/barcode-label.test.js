const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBarcodeLayout,
  buildCode128CodeSequence,
  buildLabelPdfModel,
  normalizeCode128Value,
} = require("../assets/barcode-label.js");

test("barcode labels normalize input to printable code 128 characters", () => {
  assert.equal(normalizeCode128Value(" EY061626A01 "), "EY061626A01");
  assert.equal(normalizeCode128Value(""), "UNKNOWN");
  assert.equal(normalizeCode128Value("AB\u0001CD"), "AB-CD");
});

test("barcode encoder compresses numeric runs with code set C when beneficial", () => {
  const encoded = buildCode128CodeSequence("EY061626A01");
  assert.equal(encoded.payload, "EY061626A01");
  assert.deepEqual(
    encoded.codes.slice(0, -2),
    [104, 37, 57, 99, 6, 16, 26, 100, 33, 16, 17]
  );
  assert.equal(encoded.codes.at(-1), 106);
});

test("barcode layout uses a taller bar area with larger quiet zones", () => {
  const encoded = buildCode128CodeSequence("EY061626A01");
  const layout = buildBarcodeLayout(encoded.codes);

  assert.equal(layout.pageWidthPt, 252);
  assert.equal(layout.pageHeightPt, 81);
  assert.equal(layout.barHeightPt, 57.6);
  assert.ok(layout.drawWidthPt <= 223.21);
  assert.ok(layout.leftMarginPt >= 14);
  assert.ok(layout.quietZoneWidthPt >= 16);
  assert.ok(layout.moduleWidthPt >= 1.3);
});

test("barcode layout keeps old longer accession formats within a scannable module size", () => {
  const encoded = buildCode128CodeSequence("EY1006202600006");
  const layout = buildBarcodeLayout(encoded.codes);

  assert.ok(layout.drawWidthPt <= 223.21);
  assert.ok(layout.moduleWidthPt >= 1.25);
  assert.ok(layout.quietZoneWidthPt >= 15);
});

test("barcode label text lines share the same aligned text anchor", () => {
  const model = buildLabelPdfModel({
    barcodeValue: "EY061626A01",
    patientLine: "Solis James 01/03/2006 (M)",
  });

  assert.equal(model.codeTextXPt, model.patientTextXPt);
  assert.equal(model.codeTextXPt, model.labelLayout.barStartXPt);
});
