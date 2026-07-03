(function initReportFormulas(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LabCenterReportFormulas = api;
})(typeof globalThis !== "undefined" ? globalThis : this, (root) => {
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
  const rnasepFinalReportFormula = Object.freeze({
    key: "rnasep-final-report-display",
    title: "RNaseP Final Report Suppression Formula",
    reportType: "finalReport",
    hiddenTargets: Object.freeze([
      Object.freeze({ key: "rnasep", label: "RNaseP" }),
      Object.freeze({ key: "human-rnasep", label: "Human RNaseP" }),
    ]),
  });
  const rnasepFinalReportHiddenTargetKeys = new Set(
    rnasepFinalReportFormula.hiddenTargets.map((item) => normalizePathogenRuleKey(item.label))
  );
  const formulaSettingsStorageKey = "labcenter.report-formulas.v1";
  const defaultFormulaSettings = Object.freeze({
    [sarsCov2FinalReportFormula.key]: Object.freeze({ enabled: true }),
  });
  let memoryFormulaSettings = cloneFormulaSettings(defaultFormulaSettings);

  function cloneList(items) {
    return items.map((item) => ({ ...item }));
  }

  function cloneFormulaSettings(settings) {
    return Object.fromEntries(
      Object.entries(settings || {}).map(([key, value]) => [
        key,
        { enabled: value?.enabled !== false },
      ])
    );
  }

  function normalizePathogenRuleKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
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

  function buildRnasepPlaceholder(formula) {
    const normalized = formula || rnasepFinalReportFormula;
    const labels = normalized.hiddenTargets.map((target) => target.label).join(" or ");
    return [
      `IF Pathogen Name matches ${labels}`,
      "THEN omit the row from Final Report results data",
      "ELSE keep the row in Final Report output",
    ].join("\n");
  }

  function getFormulaSettingsStorage() {
    try {
      return root?.localStorage || null;
    } catch {
      return null;
    }
  }

  function normalizeFormulaSettings(raw) {
    const next = cloneFormulaSettings(defaultFormulaSettings);
    if (!raw || typeof raw !== "object") return next;

    Object.keys(next).forEach((formulaKey) => {
      next[formulaKey] = {
        enabled: raw?.[formulaKey]?.enabled !== false,
      };
    });
    return next;
  }

  function readFormulaSettings() {
    const storage = getFormulaSettingsStorage();
    if (storage) {
      try {
        const raw = storage.getItem(formulaSettingsStorageKey);
        if (raw) {
          memoryFormulaSettings = normalizeFormulaSettings(JSON.parse(raw));
          return cloneFormulaSettings(memoryFormulaSettings);
        }
      } catch {
        // Fall through to the in-memory defaults if storage is unavailable.
      }
    }
    return cloneFormulaSettings(memoryFormulaSettings);
  }

  function writeFormulaSettings(nextSettings) {
    const normalized = normalizeFormulaSettings(nextSettings);
    memoryFormulaSettings = cloneFormulaSettings(normalized);

    const storage = getFormulaSettingsStorage();
    if (storage) {
      try {
        storage.setItem(formulaSettingsStorageKey, JSON.stringify(memoryFormulaSettings));
      } catch {
        // Keep the in-memory state even if persistence is unavailable.
      }
    }

    return cloneFormulaSettings(memoryFormulaSettings);
  }

  function resetFormulaSettings() {
    memoryFormulaSettings = cloneFormulaSettings(defaultFormulaSettings);
    const storage = getFormulaSettingsStorage();
    if (storage) {
      try {
        storage.removeItem(formulaSettingsStorageKey);
      } catch {
        // Ignore storage cleanup failures in restricted environments.
      }
    }
    return cloneFormulaSettings(memoryFormulaSettings);
  }

  function isSarsCov2FinalReportFormulaEnabled() {
    const settings = readFormulaSettings();
    return settings?.[sarsCov2FinalReportFormula.key]?.enabled !== false;
  }

  function setSarsCov2FinalReportFormulaEnabled(enabled) {
    const nextSettings = readFormulaSettings();
    nextSettings[sarsCov2FinalReportFormula.key] = {
      enabled: enabled !== false,
    };
    writeFormulaSettings(nextSettings);
    return getSarsCov2FinalReportFormula();
  }

  function getFormulaBookSections() {
    return cloneList(formulaBookSections);
  }

  function getReportTypeOptions() {
    return cloneList(reportTypeOptions);
  }

  function getSarsCov2FinalReportFormula() {
    const enabled = isSarsCov2FinalReportFormulaEnabled();
    return {
      ...sarsCov2FinalReportFormula,
      enabled,
      statusLabel: enabled ? "Enabled" : "Disabled",
      targets: cloneList(sarsCov2FinalReportFormula.targets),
      placeholder: buildCtThresholdPlaceholder(sarsCov2FinalReportFormula),
    };
  }

  function getRnasepFinalReportFormula() {
    return {
      ...rnasepFinalReportFormula,
      enabled: true,
      statusLabel: "Enabled",
      hiddenTargets: cloneList(rnasepFinalReportFormula.hiddenTargets),
      placeholder: buildRnasepPlaceholder(rnasepFinalReportFormula),
    };
  }

  function isRnasepHiddenOnFinalReport(pathogenName) {
    const needle = normalizePathogenRuleKey(pathogenName);
    if (!needle) return false;
    return rnasepFinalReportHiddenTargetKeys.has(needle);
  }

  function filterFinalReportRows(rows) {
    const normalizedRows = Array.isArray(rows) ? rows : [];
    return normalizedRows.filter((row) => !isRnasepHiddenOnFinalReport(row?.pathogen || row?.target));
  }

  function getSarsCov2FinalReportDisplayLogic() {
    const formula = getSarsCov2FinalReportFormula();
    const targetLabels = formula.targets.map((item) => item.label).join(", ");
    return {
      key: `${formula.key}-display-logic`,
      title: "Display Logic on Final Report",
      reportType: formula.reportType,
      enabled: formula.enabled !== false,
      statusLabel: formula.statusLabel,
      summary: formula.enabled !== false
        ? "Final Report currently rolls the qualifying SARS-CoV-2 gene targets into one patient-facing SARS-CoV-2 result."
        : "Final Report currently keeps the raw gene-level rows because this SARS-CoV-2 formula is disabled.",
      evaluationSteps: [
        `Evaluate ${targetLabels} against Ct <= ${formula.thresholdCt}.`,
        `Set ${formula.pathogenLabel} to Positive when at least ${formula.minimumPositiveTargets} targets qualify.`,
        `Set ${formula.pathogenLabel} to Negative when fewer than ${formula.minimumPositiveTargets} targets qualify.`,
      ],
      displaySteps: formula.enabled !== false
        ? [
            "Pathogens Detected shows one SARS-CoV-2 row instead of separate E Gene, N Gene, and Orf1ab rows.",
            "List of Pathogens Tested collapses the gene targets into a single SARS-CoV-2 label.",
            "The Final Report rollup follows the Positive or Negative status produced by this formula.",
          ]
        : [
            "Pathogens Detected keeps the original E Gene, N Gene, and Orf1ab rows from the source report.",
            "List of Pathogens Tested keeps the raw gene labels instead of collapsing them.",
            "No SARS-CoV-2 rollup is applied until this formula is enabled again.",
          ],
    };
  }

  function getRnasepFinalReportDisplayLogic() {
    const formula = getRnasepFinalReportFormula();
    const targetLabels = formula.hiddenTargets.map((item) => item.label).join(", ");
    return {
      key: `${formula.key}-display-logic`,
      title: "Display Logic on Final Report",
      reportType: formula.reportType,
      enabled: true,
      statusLabel: formula.statusLabel,
      summary: "Final Report omits RNaseP control rows from the patient-facing results while preserving the source processed result data.",
      evaluationSteps: [
        `Normalize each pathogen name before comparing it with ${targetLabels}.`,
        "Match rows labeled RNaseP or Human RNaseP.",
        "Leave every non-control row available for the remaining Final Report formulas.",
      ],
      displaySteps: [
        "Pathogens Detected omits RNaseP control rows.",
        "List of Pathogens Tested omits RNaseP control rows.",
        "The stored processed result data remains unchanged for audit and troubleshooting purposes.",
      ],
    };
  }

  function buildUnconfiguredReportFormulaReference(selectedReportType) {
    return {
      sectionKey: "report-formulas",
      selectedReportType: { ...selectedReportType },
      configured: false,
      enabled: false,
      formula: null,
      displayLogic: null,
      placeholder: "",
      note: `No formula is configured yet for ${selectedReportType.label}.`,
    };
  }

  function buildConfiguredReportFormulaReference(selectedReportType, formula, displayLogic, options = {}) {
    return {
      sectionKey: "report-formulas",
      selectedReportType: { ...selectedReportType },
      configured: true,
      enabled: formula?.enabled !== false,
      formula,
      displayLogic,
      placeholder: String(formula?.placeholder || "").trim(),
      note: String(options?.note || "").trim(),
      toggleable: options?.toggleable === true,
    };
  }

  function getReportFormulaReferences(reportType) {
    const selectedReportType = reportTypeOptions.find((item) => item.key === reportType);
    if (!selectedReportType) return [];

    const sarsFormula = getSarsCov2FinalReportFormula();
    const isNativeReportType = selectedReportType.key === sarsFormula.reportType;
    if (!isNativeReportType) return [];

    const rnasepFormula = getRnasepFinalReportFormula();
    return [
      buildConfiguredReportFormulaReference(
        selectedReportType,
        sarsFormula,
        getSarsCov2FinalReportDisplayLogic(),
        {
          note: sarsFormula.enabled !== false
            ? "This SARS-CoV-2 formula is enabled and currently drives the Final Report rollup logic."
            : "This SARS-CoV-2 formula is saved but disabled, so Final Report falls back to the raw gene-level display.",
          toggleable: true,
        }
      ),
      buildConfiguredReportFormulaReference(
        selectedReportType,
        rnasepFormula,
        getRnasepFinalReportDisplayLogic(),
        {
          note: "This RNaseP suppression formula hides RNaseP control rows from the patient-facing Final Report without changing the underlying processed result data.",
          toggleable: false,
        }
      ),
    ];
  }

  function getReportFormulaReference(reportType) {
    const selectedReportType = reportTypeOptions.find((item) => item.key === reportType);
    if (!selectedReportType) return null;

    const references = getReportFormulaReferences(reportType);
    if (references.length) return references[0];
    return buildUnconfiguredReportFormulaReference(selectedReportType);
  }

  function isReportFormulaEnabled(formulaKey) {
    const key = String(formulaKey || "").trim();
    if (!key) return false;
    if (key === sarsCov2FinalReportFormula.key) {
      return isSarsCov2FinalReportFormulaEnabled();
    }
    if (key === rnasepFinalReportFormula.key) {
      return true;
    }
    return false;
  }

  function setReportFormulaEnabled(formulaKey, enabled) {
    const key = String(formulaKey || "").trim();
    if (!key) return null;
    if (key === sarsCov2FinalReportFormula.key) {
      return setSarsCov2FinalReportFormulaEnabled(enabled);
    }
    if (key === rnasepFinalReportFormula.key) {
      return getRnasepFinalReportFormula();
    }
    return null;
  }

  return {
    filterFinalReportRows,
    getFormulaBookSections,
    getReportFormulaReferences,
    getReportTypeOptions,
    getRnasepFinalReportFormula,
    getRnasepFinalReportDisplayLogic,
    getSarsCov2FinalReportFormula,
    getSarsCov2FinalReportDisplayLogic,
    getReportFormulaReference,
    isReportFormulaEnabled,
    isRnasepHiddenOnFinalReport,
    isSarsCov2FinalReportFormulaEnabled,
    setReportFormulaEnabled,
    setSarsCov2FinalReportFormulaEnabled,
    resetFormulaSettings,
  };
});
