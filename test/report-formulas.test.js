const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSarsCov2FinalReportDetectedRows,
  evaluateSarsCov2FinalReportFormula,
  filterSarsCov2ComponentRows,
  filterFinalReportRows,
  getFormulaBookSections,
  getInconclusiveFinalReportFormula,
  getInconclusiveFinalReportDisplayLogic,
  getRnasepFinalReportFormula,
  getRnasepFinalReportDisplayLogic,
  getReportFormulaReferences,
  getReportTypeOptions,
  getSarsCov2FinalReportFormula,
  getSarsCov2FinalReportDisplayLogic,
  getReportFormulaReference,
  isRnasepHiddenOnFinalReport,
  isSarsCov2FinalReportFormulaActiveForPanel,
  isSarsCov2FinalReportFormulaEnabled,
  normalizeFinalReportResult,
  normalizeFinalReportRow,
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
  assert.deepEqual(formula.activePanels, [
    {
      key: "respiratory-pathogens-panel",
      label: "Respiratory Pathogens Panel",
      aliases: ["Respiratory Pathogen Panel", "Respiratory Pathogens Panel", "Respiratory Panel"],
    },
  ]);
  assert.deepEqual(formula.targets, [
    { key: "e", label: "E Gene" },
    { key: "n", label: "N Gene" },
    { key: "orf1ab", label: "Orf1ab" },
  ]);
  assert.match(formula.placeholder, /WHEN Selected Panel matches Respiratory Pathogens Panel/);
  assert.match(formula.placeholder, /IF COUNT\(E Gene is Detected AND Ct <= 33, N Gene is Detected AND Ct <= 33, Orf1ab is Detected AND Ct <= 33\) >= 2/);
  assert.match(formula.placeholder, /THEN SARS-CoV-2 = Positive/);
  assert.match(formula.placeholder, /AVERAGE\(Ct of Detected qualifying targets only\)/);
  assert.match(formula.placeholder, /ELSE SARS-CoV-2 = Negative/);
});

test("SARS-CoV-2 final report formula is active only for the configured respiratory panel", () => {
  assert.equal(isSarsCov2FinalReportFormulaActiveForPanel("Respiratory Pathogens Panel"), true);
  assert.equal(isSarsCov2FinalReportFormulaActiveForPanel({ id: "respiratory-pathogens-panel" }), true);
  assert.equal(isSarsCov2FinalReportFormulaActiveForPanel("Urinary Tract Infection Panel"), false);

  setSarsCov2FinalReportFormulaEnabled(false);
  assert.equal(isSarsCov2FinalReportFormulaActiveForPanel("Respiratory Panel"), false);
});

test("SARS-CoV-2 formula averages only detected qualifying target Ct values", () => {
  const rows = [
    { pathogen: "E GENE", result: "Detected", ctRaw: "", ctValue: 27 },
    { pathogen: "N GENE", result: "Positive", ctValue: 20 },
    { pathogen: "ORF1AB", result: "Not Detected", ctValue: 25 },
  ];

  const result = evaluateSarsCov2FinalReportFormula(rows, "Respiratory Pathogens Panel");

  assert.equal(result.formulaActive, true);
  assert.equal(result.status, "Positive");
  assert.equal(result.result, "Detected");
  assert.equal(result.positiveGeneCount, 2);
  assert.deepEqual(result.positiveTargetKeys, ["e", "n"]);
  assert.equal(result.averageCt, 23.5);
  assert.equal(result.genes.find((gene) => gene.key === "orf1ab").metThreshold, false);

  const displayRows = buildSarsCov2FinalReportDetectedRows([
    ...rows,
    { pathogen: "SARS-CoV-2", result: "Detected", ctValue: 27 },
    { pathogen: "Haemophilus influenzae B", result: "Detected", ctValue: 25 },
  ], result);
  assert.deepEqual(displayRows.map((row) => row.pathogen), [
    "SARS-CoV-2",
    "Haemophilus influenzae B",
  ]);
  assert.equal(displayRows[0].ctValue, 23.5);
  assert.equal(displayRows[0].ctRaw, "23.5");
});

test("SARS-CoV-2 component genes are removed without affecting genuine resistance genes", () => {
  const rows = [
    { pathogen: "E Gene", result: "Detected" },
    { pathogen: "N Gene", result: "Detected" },
    { pathogen: "Orf1ab", result: "Not Detected" },
    { pathogen: "mecA", result: "Detected" },
  ];

  assert.deepEqual(filterSarsCov2ComponentRows(rows), [
    { pathogen: "mecA", result: "Detected" },
  ]);
});

test("SARS-CoV-2 formula excludes detected targets above the Ct threshold and does not run on another panel", () => {
  const rows = [
    { pathogen: "E Gene", result: "Detected", ctValue: 31 },
    { pathogen: "N Gene", result: "Detected", ctValue: 35 },
    { pathogen: "Orf1ab", result: "Not Detected", ctValue: 20 },
  ];

  const respiratoryResult = evaluateSarsCov2FinalReportFormula(rows, "Respiratory Panel");
  assert.equal(respiratoryResult.status, "Negative");
  assert.equal(respiratoryResult.result, "Not Detected");
  assert.equal(respiratoryResult.positiveGeneCount, 1);
  assert.equal(respiratoryResult.averageCt, null);

  const otherPanelResult = evaluateSarsCov2FinalReportFormula(rows, "Wound Infection Panel");
  assert.equal(otherPanelResult.formulaActive, false);
  assert.equal(otherPanelResult.status, "Not Applied");
  assert.equal(otherPanelResult.result, "");
  assert.equal(otherPanelResult.averageCt, null);
});

test("RNaseP final report formula exposes the hide-row display rule", () => {
  const formula = getRnasepFinalReportFormula();

  assert.equal(formula.reportType, "finalReport");
  assert.equal(formula.enabled, true);
  assert.equal(formula.statusLabel, "Enabled");
  assert.equal(formula.title, "RNaseP Final Report Suppression Formula");
  assert.deepEqual(formula.hiddenTargets, [
    { key: "rnasep", label: "RNaseP" },
    { key: "human-rnasep", label: "Human RNaseP" },
  ]);
  assert.match(formula.placeholder, /IF Pathogen Name matches RNaseP or Human RNaseP/);
  assert.match(formula.placeholder, /THEN omit the row from Final Report results data/);
});

test("Inconclusive final report formula exposes the negative output rule", () => {
  const formula = getInconclusiveFinalReportFormula();

  assert.equal(formula.reportType, "finalReport");
  assert.equal(formula.enabled, true);
  assert.equal(formula.statusLabel, "Enabled");
  assert.equal(formula.title, "Inconclusive Final Report Negative Formula");
  assert.equal(formula.sourceResult, "Inconclusive");
  assert.equal(formula.outputResult, "Not Detected");
  assert.match(formula.placeholder, /IF Result contains Inconclusive/);
  assert.match(formula.placeholder, /THEN set Final Report result to Not Detected/);
});

test("final report reference resolves the active SARS-CoV-2 formula", () => {
  const reference = getReportFormulaReference("finalReport");

  assert.equal(reference.configured, true);
  assert.equal(reference.enabled, true);
  assert.equal(reference.selectedReportType.label, "Final Report");
  assert.equal(reference.formula.reportType, "finalReport");
  assert.equal(reference.formula.title, "SARS-CoV-2 Final Report Formula");
  assert.equal(reference.placeholder, reference.formula.placeholder);
  assert.match(reference.note, /currently drives the Final Report rollup logic/i);
  assert.equal(reference.toggleable, true);
});

test("final report exposes separate SARS-CoV-2 and RNaseP formula references", () => {
  const references = getReportFormulaReferences("finalReport");

  assert.equal(references.length, 3);
  assert.deepEqual(
    references.map((reference) => reference.formula.title),
    [
      "SARS-CoV-2 Final Report Formula",
      "RNaseP Final Report Suppression Formula",
      "Inconclusive Final Report Negative Formula",
    ]
  );
  assert.deepEqual(
    references.map((reference) => reference.toggleable),
    [true, false, false]
  );
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
  assert.match(displayLogic.evaluationSteps[0], /Respiratory Pathogens Panel/i);
  assert.match(displayLogic.evaluationSteps[1], /E Gene, N Gene, Orf1ab/i);
  assert.match(displayLogic.evaluationSteps[3], /Average the Ct values/i);
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

test("RNaseP display logic stays separate from the SARS-CoV-2 rollup logic", () => {
  const displayLogic = getRnasepFinalReportDisplayLogic();

  assert.equal(displayLogic.enabled, true);
  assert.match(displayLogic.summary, /omits RNaseP control rows from the patient-facing results/i);
  assert.match(displayLogic.evaluationSteps[0], /RNaseP, Human RNaseP/i);
  assert.match(displayLogic.displaySteps[0], /Pathogens Detected omits RNaseP control rows/i);
});

test("Inconclusive display logic documents normalization without mutating source data", () => {
  const displayLogic = getInconclusiveFinalReportDisplayLogic();

  assert.equal(displayLogic.enabled, true);
  assert.match(displayLogic.summary, /treats inconclusive source results as not detected/i);
  assert.match(displayLogic.evaluationSteps[0], /Inconclusive/);
  assert.match(displayLogic.displaySteps[0], /Not Detected/);
});

test("RNaseP final report hide rule matches common control-row variants", () => {
  assert.equal(isRnasepHiddenOnFinalReport("RNaseP"), true);
  assert.equal(isRnasepHiddenOnFinalReport("Human RNaseP"), true);
  assert.equal(isRnasepHiddenOnFinalReport("human-rnasep"), true);
  assert.equal(isRnasepHiddenOnFinalReport("Influenza A"), false);
});

test("final report result normalizer maps inconclusive values to not detected", () => {
  assert.equal(normalizeFinalReportResult("Inconclusive"), "Not Detected");
  assert.equal(normalizeFinalReportResult("INCONCLUSIVE - review"), "Not Detected");
  assert.equal(normalizeFinalReportResult("Detected - Low"), "Detected - Low");
  assert.equal(normalizeFinalReportResult(""), "");
});

test("final report row normalizer clones rows and preserves source data", () => {
  const source = { pathogen: "Influenza A", result: "Inconclusive", ctValue: "32.1" };
  const normalized = normalizeFinalReportRow(source);

  assert.deepEqual(normalized, { pathogen: "Influenza A", result: "Not Detected", ctValue: "32.1" });
  assert.deepEqual(source, { pathogen: "Influenza A", result: "Inconclusive", ctValue: "32.1" });
  assert.notEqual(normalized, source);
});

test("final report row filter removes RNaseP rows and normalizes inconclusive patient-facing pathogens", () => {
  const rows = [
    { pathogen: "RNaseP", result: "Detected" },
    { pathogen: "Human RNaseP", result: "Detected" },
    { target: "RNaseP", result: "Detected" },
    { pathogen: "Influenza A", result: "Inconclusive" },
    { pathogen: "SARS-CoV-2", result: "Not Detected" },
  ];

  assert.deepEqual(filterFinalReportRows(rows), [
    { pathogen: "Influenza A", result: "Not Detected" },
    { pathogen: "SARS-CoV-2", result: "Not Detected" },
  ]);
  assert.deepEqual(rows[3], { pathogen: "Influenza A", result: "Inconclusive" });
});
