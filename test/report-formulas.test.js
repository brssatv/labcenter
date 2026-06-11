const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getFormulaBookSections,
  getReportTypeOptions,
  getSarsCov2FinalReportFormula,
  getSarsCov2FinalReportDisplayLogic,
  getReportFormulaReference,
  isSarsCov2FinalReportFormulaEnabled,
  setSarsCov2FinalReportFormulaEnabled,
  resetFormulaSettings,
} = require("../assets/report-formulas.js");

test.afterEach(() => {
  resetFormulaSettings();
});

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

  assert.equal(reference.configured, true);
  assert.equal(reference.enabled, true);
  assert.equal(reference.selectedReportType.label, "Final Report");
  assert.equal(reference.formula.reportType, "finalReport");
  assert.equal(reference.placeholder, reference.formula.placeholder);
  assert.match(reference.note, /currently drives the Final Report rollup logic/i);
});

test("non-final report selections remain unconfigured until their own formulas are added", () => {
  const reference = getReportFormulaReference("generateSummaryReport");

  assert.equal(reference.configured, false);
  assert.equal(reference.selectedReportType.label, "Summary Report");
  assert.equal(reference.formula, null);
  assert.equal(reference.placeholder, "");
  assert.match(reference.note, /No formula is configured yet for Summary Report/i);
});

test("display logic describes the live SARS-CoV-2 final report rollup while enabled", () => {
  const displayLogic = getSarsCov2FinalReportDisplayLogic();

  assert.equal(isSarsCov2FinalReportFormulaEnabled(), true);
  assert.equal(displayLogic.enabled, true);
  assert.match(displayLogic.summary, /rolls the qualifying SARS-CoV-2 gene targets into one patient-facing SARS-CoV-2 result/i);
  assert.match(displayLogic.evaluationSteps[0], /E Gene, N Gene, Orf1ab/i);
  assert.match(displayLogic.displaySteps[0], /one SARS-CoV-2 row/i);
});

test("final report formula can be disabled and exposes the raw-row fallback display logic", () => {
  setSarsCov2FinalReportFormulaEnabled(false);

  const formula = getSarsCov2FinalReportFormula();
  const displayLogic = getSarsCov2FinalReportDisplayLogic();
  const reference = getReportFormulaReference("finalReport");

  assert.equal(isSarsCov2FinalReportFormulaEnabled(), false);
  assert.equal(formula.enabled, false);
  assert.equal(formula.statusLabel, "Disabled");
  assert.equal(reference.configured, true);
  assert.equal(reference.enabled, false);
  assert.match(reference.note, /saved but disabled/i);
  assert.match(displayLogic.summary, /keeps the raw gene-level rows/i);
  assert.match(displayLogic.displaySteps[0], /keeps the original E Gene, N Gene, and Orf1ab rows/i);
});
