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

  const respiratoryPanelScope = Object.freeze([
    Object.freeze({
      key: "respiratory-pathogens-panel",
      label: "Respiratory Pathogens Panel",
      aliases: Object.freeze([
        "Respiratory Pathogen Panel",
        "Respiratory Pathogens Panel",
        "Respiratory Panel",
      ]),
    }),
  ]);

  const sarsCov2FinalReportFormula = Object.freeze({
    key: "sars-cov-2-final-report",
    title: "SARS-CoV-2 Final Report Formula",
    pathogenLabel: "SARS-CoV-2",
    reportType: "finalReport",
    thresholdCt: 33,
    minimumPositiveTargets: 2,
    activePanels: respiratoryPanelScope,
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
  const inconclusiveFinalReportFormula = Object.freeze({
    key: "inconclusive-final-report-negative",
    title: "Inconclusive Final Report Negative Formula",
    reportType: "finalReport",
    sourceResult: "Inconclusive",
    outputResult: "Not Detected",
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

  function clonePanelList(items) {
    return items.map((item) => ({
      ...item,
      aliases: Array.isArray(item?.aliases) ? [...item.aliases] : [],
    }));
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

  function normalizePanelRuleKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function getPanelReferenceValues(panelReference) {
    if (panelReference && typeof panelReference === "object") {
      return [
        panelReference.id,
        panelReference.key,
        panelReference.name,
        panelReference.label,
        panelReference.panelName,
      ];
    }
    return [panelReference];
  }

  function isPanelInFormulaScope(panelReference, formula = sarsCov2FinalReportFormula) {
    const panelKeys = getPanelReferenceValues(panelReference)
      .map((value) => normalizePanelRuleKey(value))
      .filter(Boolean);
    if (!panelKeys.length) return false;

    return formula.activePanels.some((panel) => {
      const configuredKeys = [panel.key, panel.label, ...(panel.aliases || [])]
        .map((value) => normalizePanelRuleKey(value))
        .filter(Boolean);
      return panelKeys.some((key) => configuredKeys.includes(key));
    });
  }

  function normalizeSarsCov2TargetKey(value) {
    const key = normalizePathogenRuleKey(value);
    if (!key) return "";
    if (key === "egene" || key.endsWith("egene")) return "e";
    if (key === "ngene" || key.endsWith("ngene")) return "n";
    if (key.includes("orf1ab") || key.includes("orflab")) return "orf1ab";
    return "";
  }

  function isSarsCov2ComponentTarget(value) {
    return Boolean(normalizeSarsCov2TargetKey(value));
  }

  function filterSarsCov2ComponentRows(rows) {
    return (Array.isArray(rows) ? rows : []).filter(
      (row) => !isSarsCov2ComponentTarget(row?.pathogen || row?.target || row?.gene)
    );
  }

  function parseFormulaCtValue(row) {
    const candidates = [row?.ctRaw, row?.ctValue, row?.ct];
    for (const rawValue of candidates) {
      if (rawValue === null || rawValue === undefined || rawValue === "") continue;
      const rawText = String(rawValue).trim();
      if (!rawText || rawText.toLowerCase() === "undetermined") continue;
      const matched = rawText.match(/-?\d+(?:\.\d+)?/);
      if (!matched) continue;
      const parsed = Number(matched[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  function isPositiveFormulaResult(value) {
    if (typeof value === "boolean") return value;
    const normalized = normalizePathogenRuleKey(value);
    if (!normalized || normalized.includes("notdetected") || normalized.includes("negative")) return false;
    return normalized.includes("detected") || normalized.includes("positive") || normalized === "true";
  }

  function buildCtThresholdPlaceholder(formula) {
    const normalized = formula || sarsCov2FinalReportFormula;
    const panelLabels = normalized.activePanels.map((panel) => panel.label).join(", ");
    const comparisons = normalized.targets.map(
      (target) => `${target.label} is Detected AND Ct <= ${normalized.thresholdCt}`
    );
    return [
      `WHEN Selected Panel matches ${panelLabels}`,
      `IF COUNT(${comparisons.join(", ")}) >= ${normalized.minimumPositiveTargets}`,
      `THEN ${normalized.pathogenLabel} = Positive`,
      `AND ${normalized.pathogenLabel} Ct = AVERAGE(Ct of Detected qualifying targets only)`,
      `ELSE ${normalized.pathogenLabel} = Negative AND Ct = blank`,
      `OUTPUT one ${normalized.pathogenLabel} row and omit its component gene rows`,
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

  function buildInconclusivePlaceholder(formula) {
    const normalized = formula || inconclusiveFinalReportFormula;
    return [
      `IF Result contains ${normalized.sourceResult}`,
      `THEN set Final Report result to ${normalized.outputResult}`,
      "ELSE keep the source result in Final Report output",
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
      activePanels: clonePanelList(sarsCov2FinalReportFormula.activePanels),
      targets: cloneList(sarsCov2FinalReportFormula.targets),
      placeholder: buildCtThresholdPlaceholder(sarsCov2FinalReportFormula),
    };
  }

  function isSarsCov2FinalReportFormulaActiveForPanel(panelReference) {
    return isSarsCov2FinalReportFormulaEnabled()
      && isPanelInFormulaScope(panelReference, sarsCov2FinalReportFormula);
  }

  function evaluateSarsCov2FinalReportFormula(rows, panelReference) {
    const formula = getSarsCov2FinalReportFormula();
    const formulaActive = formula.enabled !== false && isPanelInFormulaScope(panelReference, formula);
    const sourceRows = Array.isArray(rows) ? rows : [];
    const targetRows = new Map();

    sourceRows.forEach((row) => {
      const targetKey = normalizeSarsCov2TargetKey(row?.pathogen || row?.target || row?.gene);
      if (!targetKey) return;
      const ctValue = parseFormulaCtValue(row);
      const detected = isPositiveFormulaResult(row?.result);
      const qualifies = detected && Number.isFinite(ctValue) && ctValue <= formula.thresholdCt;
      const candidate = { row, ctValue, detected, qualifies };
      const existing = targetRows.get(targetKey);
      if (!existing) {
        targetRows.set(targetKey, candidate);
        return;
      }

      const candidateRank = qualifies ? 3 : detected && Number.isFinite(ctValue) ? 2 : Number.isFinite(ctValue) ? 1 : 0;
      const existingRank = existing.qualifies
        ? 3
        : existing.detected && Number.isFinite(existing.ctValue)
          ? 2
          : Number.isFinite(existing.ctValue)
            ? 1
            : 0;
      if (
        candidateRank > existingRank
        || (candidateRank === existingRank
          && Number.isFinite(ctValue)
          && (!Number.isFinite(existing.ctValue) || ctValue < existing.ctValue))
      ) {
        targetRows.set(targetKey, candidate);
      }
    });

    const genes = formula.targets.map((target) => {
      const candidate = targetRows.get(target.key);
      return {
        ...target,
        sourceRow: candidate?.row || null,
        result: candidate?.row?.result || "",
        ctValue: candidate?.ctValue ?? null,
        detected: candidate?.detected === true,
        metThreshold: candidate?.qualifies === true,
      };
    });
    const positiveGenes = genes.filter((gene) => gene.metThreshold);
    const positiveGeneCount = positiveGenes.length;
    const evaluatedStatus = positiveGeneCount >= formula.minimumPositiveTargets ? "Positive" : "Negative";
    const status = formulaActive ? evaluatedStatus : "Not Applied";
    const positiveCtAverage = positiveGeneCount
      ? positiveGenes.reduce((total, gene) => total + gene.ctValue, 0) / positiveGeneCount
      : null;

    return {
      formulaEnabled: formula.enabled !== false,
      formulaActive,
      panelReference,
      threshold: formula.thresholdCt,
      genes,
      positiveGeneCount,
      positiveTargetKeys: positiveGenes.map((gene) => gene.key),
      minimumPositiveTargets: formula.minimumPositiveTargets,
      status,
      result: status === "Positive" ? "Detected" : status === "Negative" ? "Not Detected" : "",
      averageCt: status === "Positive" ? positiveCtAverage : null,
    };
  }

  function buildSarsCov2FinalReportDetectedRows(rows, evaluation) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const nonSarsRows = sourceRows.filter((row) => {
      const label = row?.pathogen || row?.target || row?.gene;
      return !isSarsCov2ComponentTarget(label) && normalizePathogenRuleKey(label) !== "sarscov2";
    });
    if (!evaluation?.formulaActive || evaluation.status !== "Positive") return nonSarsRows;

    const preferredSourceRow = evaluation.genes?.find((gene) => gene.metThreshold)?.sourceRow || null;
    return [
      {
        ...(preferredSourceRow || {}),
        pathogen: sarsCov2FinalReportFormula.pathogenLabel,
        result: evaluation.result || "Detected",
        ctRaw: String(evaluation.averageCt ?? ""),
        ctValue: evaluation.averageCt,
      },
      ...nonSarsRows,
    ];
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

  function getInconclusiveFinalReportFormula() {
    return {
      ...inconclusiveFinalReportFormula,
      enabled: true,
      statusLabel: "Enabled",
      placeholder: buildInconclusivePlaceholder(inconclusiveFinalReportFormula),
    };
  }

  function isRnasepHiddenOnFinalReport(pathogenName) {
    const needle = normalizePathogenRuleKey(pathogenName);
    if (!needle) return false;
    return rnasepFinalReportHiddenTargetKeys.has(needle);
  }

  function normalizeFinalReportResult(value) {
    const raw = String(value || "").trim();
    if (!raw) return value;
    return raw.toLowerCase().includes("inconclusive")
      ? inconclusiveFinalReportFormula.outputResult
      : value;
  }

  function normalizeFinalReportRow(row) {
    if (!row || typeof row !== "object") return row;
    const normalizedResult = normalizeFinalReportResult(row.result);
    return normalizedResult === row.result
      ? { ...row }
      : { ...row, result: normalizedResult };
  }

  function filterFinalReportRows(rows) {
    const normalizedRows = Array.isArray(rows) ? rows : [];
    return normalizedRows
      .filter((row) => !isRnasepHiddenOnFinalReport(row?.pathogen || row?.target))
      .map((row) => normalizeFinalReportRow(row));
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
        `Apply this formula only when the selected panel matches ${formula.activePanels.map((panel) => panel.label).join(", ")}.`,
        `Evaluate ${targetLabels} as positive only when the result is Detected and Ct <= ${formula.thresholdCt}.`,
        `Set ${formula.pathogenLabel} to Positive when at least ${formula.minimumPositiveTargets} targets qualify.`,
        `Average the Ct values of qualifying positive targets only; set Ct to blank for a Negative result.`,
      ],
      displaySteps: formula.enabled !== false
        ? [
            "Pathogens Detected shows one SARS-CoV-2 row instead of separate E Gene, N Gene, and Orf1ab rows.",
            "The consolidated SARS-CoV-2 row shows the positive-target Ct average.",
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

  function getInconclusiveFinalReportDisplayLogic() {
    const formula = getInconclusiveFinalReportFormula();
    return {
      key: `${formula.key}-display-logic`,
      title: "Display Logic on Final Report",
      reportType: formula.reportType,
      enabled: true,
      statusLabel: formula.statusLabel,
      summary: "Final Report treats inconclusive source results as not detected in patient-facing output while preserving the source processed result data.",
      evaluationSteps: [
        `Inspect each output row result for ${formula.sourceResult}.`,
        `Replace matching Final Report output values with ${formula.outputResult}.`,
        "Leave non-inconclusive source results unchanged for downstream report and ORU output.",
      ],
      displaySteps: [
        `Pathogens Detected excludes rows normalized to ${formula.outputResult}.`,
        `List of Pathogens Tested shows the normalized ${formula.outputResult} status.`,
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
    const inconclusiveFormula = getInconclusiveFinalReportFormula();
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
      buildConfiguredReportFormulaReference(
        selectedReportType,
        inconclusiveFormula,
        getInconclusiveFinalReportDisplayLogic(),
        {
          note: "This inconclusive result formula normalizes inconclusive rows to Not Detected in patient-facing Final Report and ORU output without changing the underlying processed result data.",
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
    if (key === inconclusiveFinalReportFormula.key) {
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
    if (key === inconclusiveFinalReportFormula.key) {
      return getInconclusiveFinalReportFormula();
    }
    return null;
  }

  return {
    buildSarsCov2FinalReportDetectedRows,
    evaluateSarsCov2FinalReportFormula,
    filterSarsCov2ComponentRows,
    filterFinalReportRows,
    getFormulaBookSections,
    getInconclusiveFinalReportFormula,
    getInconclusiveFinalReportDisplayLogic,
    getReportFormulaReferences,
    getReportTypeOptions,
    getRnasepFinalReportFormula,
    getRnasepFinalReportDisplayLogic,
    getSarsCov2FinalReportFormula,
    getSarsCov2FinalReportDisplayLogic,
    getReportFormulaReference,
    isReportFormulaEnabled,
    isRnasepHiddenOnFinalReport,
    isSarsCov2FinalReportFormulaActiveForPanel,
    isSarsCov2FinalReportFormulaEnabled,
    normalizeFinalReportResult,
    normalizeFinalReportRow,
    setReportFormulaEnabled,
    setSarsCov2FinalReportFormulaEnabled,
    resetFormulaSettings,
  };
});
