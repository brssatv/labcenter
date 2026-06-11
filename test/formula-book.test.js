const test = require("node:test");
const assert = require("node:assert/strict");

const reportFormulasApi = require("../assets/report-formulas.js");
globalThis.LabCenterReportFormulas = reportFormulasApi;
const formulaPlaygroundApi = require("../assets/formula-playground.js");
globalThis.LabCenterFormulaPlayground = formulaPlaygroundApi;

const {
  setSarsCov2FinalReportFormulaEnabled,
  resetFormulaSettings,
} = reportFormulasApi;
const { resetFormulaPlaygroundDraft } = formulaPlaygroundApi;

const {
  createDefaultFormulaBookState,
  getSarsCov2FinalReportFormulaConfig,
  buildFormulaBookViewModel,
  buildFormulaBookMarkup,
} = require("../assets/formula-book.js");

test.afterEach(() => {
  resetFormulaSettings();
  resetFormulaPlaygroundDraft();
});

test("formula book default state starts on reports with no selected type", () => {
  assert.deepEqual(createDefaultFormulaBookState(), {
    section: "report-formulas",
    reportType: "",
  });
});

test("formula book final report view model exposes the configured SARS-CoV-2 rule", () => {
  const viewModel = buildFormulaBookViewModel({
    section: "report-formulas",
    reportType: "finalReport",
  });

  assert.equal(viewModel.state.reportType, "finalReport");
  assert.equal(viewModel.reportReference.configured, true);
  assert.equal(viewModel.formulaConfig.enabled, true);
  assert.equal(viewModel.formulaConfig.reportType, "finalReport");
  assert.equal(viewModel.formulaConfig.thresholdCt, 33);
  assert.match(viewModel.displayLogic.summary, /patient-facing SARS-CoV-2 result/i);
});

test("formula book summary report view model stays unconfigured", () => {
  const viewModel = buildFormulaBookViewModel({
    section: "report-formulas",
    reportType: "generateSummaryReport",
  });

  assert.equal(viewModel.reportReference.configured, false);
  assert.equal(viewModel.formulaConfig, null);
  assert.match(viewModel.reportReference.note, /No formula is configured yet for Summary Report/i);
});

test("formula book markup includes the live toggle and display logic alongside the formula", () => {
  const markup = buildFormulaBookMarkup(buildFormulaBookViewModel({
    section: "report-formulas",
    reportType: "finalReport",
  }));

  assert.match(markup, /Live Formula Toggle/);
  assert.match(markup, /Report Display Logic/);
  assert.match(markup, /Report Output/);
  assert.match(markup, /Enabled/);
  assert.match(markup, /Simple Formula Tester/);
  assert.match(markup, /Data Input/);
  assert.match(markup, /Formula Expression/);
  assert.match(markup, /Processed Output/);
});

test("formula book config accessor stays aligned with the live final formula", () => {
  const formula = getSarsCov2FinalReportFormulaConfig();

  assert.equal(formula.reportType, "finalReport");
  assert.equal(formula.thresholdCt, 33);
  assert.equal(formula.minimumPositiveTargets, 2);
});

test("formula book reflects the disabled formula fallback mode", () => {
  setSarsCov2FinalReportFormulaEnabled(false);

  const viewModel = buildFormulaBookViewModel({
    section: "report-formulas",
    reportType: "finalReport",
  });

  assert.equal(viewModel.formulaConfig.enabled, false);
  assert.equal(viewModel.formulaConfig.statusLabel, "Disabled");
  assert.match(viewModel.reportReference.note, /saved but disabled/i);
  assert.match(viewModel.displayLogic.summary, /keeps the raw gene-level rows/i);
});
