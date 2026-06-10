const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getFormulaBookSections,
  getReportTypeOptions,
  getSarsCov2FinalReportFormula,
  getReportFormulaReference,
} = require("../assets/report-formulas.js");

test("formula book exposes the reports section", () => {
  assert.deepEqual(getFormulaBookSections(), [
    { key: "report-formulas", label: "Formula for Reports" },
  ]);
});

test("report type options stay aligned with output results actions", () => {
  assert.deepEqual(getReportTypeOptions(), [
    { key: "generateReport", label: "Generate Report" },
    { key: "generateSummaryReport", label: "Summary Report" },
    { key: "finalReport", label: "Final Report" },
  ]);
});

test("SARS-CoV-2 final report formula exposes the live threshold rule", () => {
  const formula = getSarsCov2FinalReportFormula();

  assert.equal(formula.reportType, "finalReport");
  assert.equal(formula.thresholdCt, 33);
  assert.equal(formula.minimumPositiveTargets, 2);
  assert.deepEqual(formula.targets, [
    { key: "e", label: "E Gene" },
    { key: "n", label: "N Gene" },
    { key: "orf1ab", label: "Orf1ab" },
  ]);
  assert.match(formula.placeholder, /IF COUNT\(E Gene Ct <= 33, N Gene Ct <= 33, Orf1ab Ct <= 33\) >= 2/);
  assert.match(formula.placeholder, /THEN SARS-CoV-2 = Positive/);
  assert.match(formula.placeholder, /ELSE SARS-CoV-2 = Negative/);
});

test("final report reference resolves the active SARS-CoV-2 formula", () => {
  const reference = getReportFormulaReference("finalReport");

  assert.equal(reference.selectedReportType.label, "Final Report");
  assert.equal(reference.formula.reportType, "finalReport");
  assert.equal(reference.placeholder, reference.formula.placeholder);
  assert.match(reference.note, /active SARS-CoV-2 formula/i);
});

test("non-final report selections reuse the final report placeholder as a reference", () => {
  const reference = getReportFormulaReference("generateSummaryReport");

  assert.equal(reference.selectedReportType.label, "Summary Report");
  assert.equal(reference.formula.reportType, "finalReport");
  assert.match(reference.note, /Summary Report formulas are being modularized/i);
});
