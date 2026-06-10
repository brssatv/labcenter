(function initReportFormulas(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LabCenterReportFormulas = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const formulaBookSections = Object.freeze([
    { key: "report-formulas", label: "Formula for Reports" },
  ]);

  const reportTypeOptions = Object.freeze([
    { key: "generateReport", label: "Generate Report" },
    { key: "generateSummaryReport", label: "Summary Report" },
    { key: "finalReport", label: "Final Report" },
  ]);

  const sarsCov2FinalReportFormula = Object.freeze({
    key: "sars-cov-2-final-report",
    title: "SARS-CoV-2 Final Report Formula",
    pathogenLabel: "SARS-CoV-2",
    reportType: "finalReport",
    thresholdCt: 33,
    minimumPositiveTargets: 2,
    targets: Object.freeze([
      Object.freeze({ key: "e", label: "E Gene" }),
      Object.freeze({ key: "n", label: "N Gene" }),
      Object.freeze({ key: "orf1ab", label: "Orf1ab" }),
    ]),
  });

  function cloneList(items) {
    return items.map((item) => ({ ...item }));
  }

  function buildCtThresholdPlaceholder(formula) {
    const normalized = formula || sarsCov2FinalReportFormula;
    const comparisons = normalized.targets.map((target) => `${target.label} Ct <= ${normalized.thresholdCt}`);
    return [
      `IF COUNT(${comparisons.join(", ")}) >= ${normalized.minimumPositiveTargets}`,
      `THEN ${normalized.pathogenLabel} = Positive`,
      `ELSE ${normalized.pathogenLabel} = Negative`,
    ].join("\n");
  }

  function getFormulaBookSections() {
    return cloneList(formulaBookSections);
  }

  function getReportTypeOptions() {
    return cloneList(reportTypeOptions);
  }

  function getSarsCov2FinalReportFormula() {
    return {
      ...sarsCov2FinalReportFormula,
      targets: cloneList(sarsCov2FinalReportFormula.targets),
      placeholder: buildCtThresholdPlaceholder(sarsCov2FinalReportFormula),
    };
  }

  function getReportFormulaReference(reportType) {
    const selectedReportType = reportTypeOptions.find((item) => item.key === reportType);
    if (!selectedReportType) return null;

    const formula = getSarsCov2FinalReportFormula();
    const isNativeReportType = selectedReportType.key === formula.reportType;
    return {
      sectionKey: "report-formulas",
      selectedReportType: { ...selectedReportType },
      formula,
      placeholder: formula.placeholder,
      note: isNativeReportType
        ? "This is the active SARS-CoV-2 formula used during Final Report generation."
        : `This placeholder currently references the Final Report SARS-CoV-2 rule while ${selectedReportType.label} formulas are being modularized.`,
    };
  }

  return {
    getFormulaBookSections,
    getReportTypeOptions,
    getSarsCov2FinalReportFormula,
    getReportFormulaReference,
  };
});
