(function initManualTranscription(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LabCenterManualTranscription = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const panelAliasGroups = [
    ["uti-panel", [
      "Urinary Tract Infection Panel",
      "Urinary Tract Infection PCR Panel",
      "UTI PCR Panel",
      "UTI Panel",
    ]],
    ["sti-panel", [
      "Sexually Transmitted Infection Panel",
      "STI Panel",
    ]],
    ["eye-panel", [
      "Eye Infection Panel",
      "Eye Panel",
    ]],
    ["respiratory-panel", [
      "Respiratory Pathogen Panel",
      "Respiratory Pathogens Panel",
      "Respiratory Panel",
    ]],
    ["wound-panel", [
      "Wound Infection Panel",
      "Wound Panel",
    ]],
    ["womens-health-panel", [
      "Women's Health Panel",
      "Womens Health Panel",
    ]],
    ["gastrointestinal-panel", [
      "Gastrointestinal Infection Panel",
      "Gastrointestinal Panel",
      "GI Panel",
    ]],
  ];

  const resultOptions = Object.freeze([
    Object.freeze({ value: "Not Detected", label: "Not Detected" }),
    Object.freeze({ value: "Detected", label: "Detected" }),
    Object.freeze({ value: "Detected - Low", label: "Detected - Low" }),
    Object.freeze({ value: "Detected - Moderate", label: "Detected - Moderate" }),
    Object.freeze({ value: "Detected - High", label: "Detected - High" }),
    Object.freeze({ value: "Inconclusive", label: "Inconclusive" }),
  ]);

  const canonicalResultMap = new Map(resultOptions.map((option) => [normalizeToken(option.value), option.value]));
  canonicalResultMap.set("negative", "Not Detected");
  canonicalResultMap.set("positive", "Detected");

  const panelAliasLookup = buildPanelAliasLookup(panelAliasGroups);

  function defaultEscapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeToken(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "");
  }

  function buildPanelAliasLookup(groups) {
    const lookup = new Map();
    groups.forEach(([, aliases]) => {
      const normalizedAliases = aliases
        .map((value) => normalizeToken(value))
        .filter(Boolean);
      const tokenSet = Array.from(new Set(normalizedAliases));
      tokenSet.forEach((token) => {
        lookup.set(token, tokenSet);
      });
    });
    return lookup;
  }

  function resolvePanelTokens(panelName) {
    const normalized = normalizeToken(panelName);
    if (!normalized) return [];
    const matchedTokens = panelAliasLookup.get(normalized);
    return matchedTokens ? Array.from(new Set([normalized, ...matchedTokens])) : [normalized];
  }

  function normalizeDefaultSampleId(value) {
    const sampleId = String(value || "").trim();
    if (!sampleId || sampleId === "-") return "";
    return sampleId;
  }

  function buildOptionDescription(value, extraParts = []) {
    const descriptionParts = extraParts
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    if (!descriptionParts.length) return value;
    return `${value} - ${descriptionParts.join(" / ")}`;
  }

  function isActiveCatalogRecord(record) {
    const normalized = String(record?.status || "active").trim().toLowerCase();
    return normalized !== "inactive" && normalized !== "disabled";
  }

  function sortOptionsByDescription(options) {
    return options.slice().sort((left, right) => {
      const leftLabel = String(left?.description || left?.value || "");
      const rightLabel = String(right?.description || right?.value || "");
      return leftLabel.localeCompare(rightLabel);
    });
  }

  function createManualTranscriptionReport(options = {}) {
    const panelName = String(options.panelName || "Lab Panel").trim() || "Lab Panel";
    const defaultSampleId = normalizeDefaultSampleId(options.accessionNo || options.defaultSampleId || "");

    return {
      panelName,
      summary: {
        sampleCount: 0,
        totalRows: 0,
        detectedCount: 0,
      },
      metadata: {
        entryMode: "manual-transcription",
        defaultSampleId,
        manualEditNote: "",
      },
      detected: [],
      detailed: [],
    };
  }

  function resolveManualTranscriptionStatus(status) {
    const normalized = String(status || "").trim().toLowerCase();
    if (!normalized || normalized === "pending") return "Processed";
    return status || "Processed";
  }

  function getManualTranscriptionPathogenOptions(options = {}) {
    const panelTokens = resolvePanelTokens(options.panelName);
    const registryRows = Array.isArray(options.masterRegistryRecords) ? options.masterRegistryRecords : [];
    const normalizedPanelTokens = new Set(panelTokens);
    const optionMap = new Map();
    const matchingRows = registryRows.filter((record) => {
      if (!isActiveCatalogRecord(record)) return false;
      const recordPanels = Array.isArray(record?.panels) ? record.panels : [];
      if (!normalizedPanelTokens.size) return true;
      return recordPanels.some((panelLabel) => normalizedPanelTokens.has(normalizeToken(panelLabel)));
    });
    const sourceRows = matchingRows.length ? matchingRows : registryRows.filter(isActiveCatalogRecord);

    sourceRows.forEach((record) => {
      const scientificName = String(record?.scientific_name || "").trim();
      if (!scientificName) return;
      const commonName = String(record?.common_name || "").trim();
      const type = String(record?.type || "").trim();
      const description = buildOptionDescription(scientificName, [
        commonName,
        type,
      ]);
      optionMap.set(scientificName, {
        value: scientificName,
        description,
        commonName,
        type,
      });
    });

    return sortOptionsByDescription(Array.from(optionMap.values()));
  }

  function getManualTranscriptionResistanceOptions(options = {}) {
    const resistanceRows = Array.isArray(options.masterResistanceGeneCatalog) ? options.masterResistanceGeneCatalog : [];
    const optionMap = new Map();

    resistanceRows
      .filter(isActiveCatalogRecord)
      .forEach((record) => {
        const gene = String(record?.gene || "").trim();
        if (!gene) return;
        const resistanceClass = String(record?.resistanceClass || "").trim();
        optionMap.set(gene, {
          value: gene,
          description: buildOptionDescription(gene, [resistanceClass]),
          resistanceClass,
        });
      });

    return sortOptionsByDescription(Array.from(optionMap.values()));
  }

  function createManualTranscriptionUiModel(options = {}) {
    const orderId = String(options.orderId || "").trim() || "order";
    const panelName = String(options.panelName || "Lab Panel").trim() || "Lab Panel";
    const accessionNo = normalizeDefaultSampleId(options.accessionNo || "");
    const pathogenOptions = getManualTranscriptionPathogenOptions({
      panelName,
      masterRegistryRecords: options.masterRegistryRecords,
    });
    const abrGeneOptions = getManualTranscriptionResistanceOptions({
      masterResistanceGeneCatalog: options.masterResistanceGeneCatalog,
    });

    return {
      orderId,
      panelName,
      accessionNo,
      pathogenOptions,
      abrGeneOptions,
      resultOptions: resultOptions.map((option) => ({ ...option })),
      pathogenListId: `transcribe-pathogen-options-${orderId}`,
      abrGeneListId: `transcribe-abr-options-${orderId}`,
    };
  }

  function buildManualTranscriptionIntroMarkup(model, escapeHtml = defaultEscapeHtml) {
    if (!model || typeof model !== "object") return "";
    return `
      <section class="transcribe-hero">
        <div class="transcribe-hero-copy">
          <span class="transcribe-kicker">Manual Result Entry</span>
          <h4>Transcribe ${escapeHtml(model.panelName || "Lab Panel")}</h4>
          <p>Use the searchable panel dropdown for pathogens, pick a standardized result, and analyze whenever you want the detected summary refreshed.</p>
        </div>
        <div class="transcribe-stat-strip">
          <article class="transcribe-stat-card">
            <span>Sample</span>
            <strong>${escapeHtml(model.accessionNo || "Current order")}</strong>
          </article>
          <article class="transcribe-stat-card">
            <span>Pathogen options</span>
            <strong>${escapeHtml(model.pathogenOptions?.length || 0)}</strong>
          </article>
          <article class="transcribe-stat-card">
            <span>ABR genes</span>
            <strong>${escapeHtml(model.abrGeneOptions?.length || 0)}</strong>
          </article>
        </div>
      </section>
    `;
  }

  function buildLookupOptionsMarkup(options, escapeHtml = defaultEscapeHtml) {
    const rows = Array.isArray(options) ? options : [];
    return rows
      .map((option) => `
        <option value="${escapeHtml(option.value || "")}" label="${escapeHtml(option.description || option.value || "")}">
          ${escapeHtml(option.description || option.value || "")}
        </option>
      `)
      .join("");
  }

  function buildManualTranscriptionLookupMarkup(model, escapeHtml = defaultEscapeHtml) {
    if (!model || typeof model !== "object") return "";
    return `
      <div class="transcribe-guidance">
        <span class="transcribe-guide-chip">Searchable pathogen dropdown</span>
        <span class="transcribe-guide-chip">Panel-aware suggestions</span>
        <span class="transcribe-guide-chip">Standardized result selections</span>
      </div>
      <datalist id="${escapeHtml(model.pathogenListId || "")}">
        ${buildLookupOptionsMarkup(model.pathogenOptions, escapeHtml)}
      </datalist>
      <datalist id="${escapeHtml(model.abrGeneListId || "")}">
        ${buildLookupOptionsMarkup(model.abrGeneOptions, escapeHtml)}
      </datalist>
    `;
  }

  function buildManualTranscriptionTargetFieldMarkup(options = {}) {
    const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
    const model = options.model && typeof options.model === "object" ? options.model : {};
    const item = options.item && typeof options.item === "object" ? options.item : {};
    const sourceIndex = Number.isFinite(Number(options.sourceIndex)) ? Number(options.sourceIndex) : 0;
    const section = String(options.section || "detailed").trim() || "detailed";
    const kind = String(options.kind || "pathogen").trim().toLowerCase() === "abr" ? "abr" : "pathogen";
    const currentValue = String(item.pathogen || item.target || "").trim();
    const listId = kind === "abr" ? model.abrGeneListId : model.pathogenListId;
    const optionCount = kind === "abr"
      ? Number(model.abrGeneOptions?.length || 0)
      : Number(model.pathogenOptions?.length || 0);
    const placeholder = kind === "abr" ? "Select ABR gene" : "Select panel pathogen";
    const hint = kind === "abr"
      ? `${optionCount} ABR gene options`
      : `${optionCount} panel targets`;

    return `
      <div class="transcribe-target-shell">
        <input
          class="preview-edit-input transcribe-target-input"
          list="${escapeHtml(listId || "")}"
          data-validate-field="pathogen"
          data-validate-section="${escapeHtml(section)}"
          data-validate-index="${sourceIndex}"
          value="${escapeHtml(currentValue)}"
          placeholder="${escapeHtml(placeholder)}"
          autocomplete="off"
        >
        <span class="transcribe-target-hint">${escapeHtml(hint)}</span>
      </div>
    `;
  }

  function canonicalizeResultLabel(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "Not Detected";
    const normalized = normalizeToken(trimmed);
    return canonicalResultMap.get(normalized) || trimmed;
  }

  function buildManualTranscriptionResultFieldMarkup(options = {}) {
    const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
    const model = options.model && typeof options.model === "object" ? options.model : {};
    const sourceIndex = Number.isFinite(Number(options.sourceIndex)) ? Number(options.sourceIndex) : 0;
    const section = String(options.section || "detailed").trim() || "detailed";
    const currentValue = canonicalizeResultLabel(options.value);
    const nextOptions = Array.isArray(model.resultOptions) && model.resultOptions.length
      ? model.resultOptions
      : resultOptions;
    const optionMarkup = nextOptions
      .map((option) => {
        const optionValue = canonicalizeResultLabel(option.value);
        const isSelected = optionValue === currentValue;
        return `<option value="${escapeHtml(optionValue)}" ${isSelected ? "selected" : ""}>${escapeHtml(option.label || optionValue)}</option>`;
      })
      .join("");

    return `
      <div class="transcribe-result-shell">
        <select
          class="preview-edit-input transcribe-result-select"
          data-validate-field="result"
          data-validate-section="${escapeHtml(section)}"
          data-validate-index="${sourceIndex}"
        >
          ${optionMarkup}
        </select>
        <span class="transcribe-result-hint">Standardized result</span>
      </div>
    `;
  }

  function isDetectedResult(value) {
    const normalized = String(value || "").toLowerCase();
    return normalized.includes("detected") && !normalized.includes("not detected");
  }

  function resolveClassificationFromResult(value) {
    const normalized = canonicalizeResultLabel(value).toLowerCase();
    if (normalized.includes("not detected")) return "Negative";
    if (normalized.includes("high")) return "High";
    if (normalized.includes("moderate")) return "Moderate";
    if (normalized.includes("low")) return "Low";
    if (normalized.includes("inconclusive")) return "Inconclusive";
    if (normalized.includes("detected")) return "Positive";
    return "";
  }

  function cloneReport(report) {
    if (!report || typeof report !== "object") return null;
    return {
      ...report,
      summary: report.summary && typeof report.summary === "object" ? { ...report.summary } : {},
      metadata: report.metadata && typeof report.metadata === "object" ? { ...report.metadata } : {},
      detected: Array.isArray(report.detected) ? report.detected.map((row) => ({ ...row })) : [],
      detailed: Array.isArray(report.detailed) ? report.detailed.map((row) => ({ ...row })) : [],
    };
  }

  function isMeaningfulManualRow(row) {
    const pathogen = String(row?.pathogen || row?.target || "").trim();
    const well = String(row?.well || "").trim();
    const ctValue = String(row?.ctValue ?? row?.ctRaw ?? "").trim();
    const result = canonicalizeResultLabel(row?.result);
    return Boolean(pathogen || well || ctValue || (result && result !== "Not Detected"));
  }

  function normalizeManualRow(row) {
    const nextRow = row && typeof row === "object" ? { ...row } : {};
    const pathogen = String(nextRow.pathogen || nextRow.target || "").trim();
    const sample = String(nextRow.sample || "").trim();
    const well = String(nextRow.well || "").trim();
    const ctValue = String(nextRow.ctValue ?? nextRow.ctRaw ?? "").trim();
    const result = canonicalizeResultLabel(nextRow.result);
    const recordType = String(nextRow.recordType || "").trim().toLowerCase() === "abr" ? "abr" : "pathogen";

    return {
      ...nextRow,
      pathogen,
      sample,
      well,
      ctValue,
      ctRaw: ctValue,
      result,
      ampStatus: result,
      classification: resolveClassificationFromResult(result),
      recordType,
    };
  }

  function normalizeManualTranscriptionReport(report) {
    const nextReport = cloneReport(report);
    if (!nextReport) return null;

    const detailedRows = (Array.isArray(nextReport.detailed) ? nextReport.detailed : [])
      .map(normalizeManualRow)
      .filter(isMeaningfulManualRow);
    const detectedRows = detailedRows
      .filter((row) => isDetectedResult(row?.result))
      .map((row) => ({ ...row }));
    const sampleCount = [...new Set(detailedRows.map((row) => String(row?.sample || "").trim()).filter(Boolean))].length;

    nextReport.detailed = detailedRows;
    nextReport.detected = detectedRows;
    nextReport.summary = {
      ...(nextReport.summary && typeof nextReport.summary === "object" ? nextReport.summary : {}),
      sampleCount,
      totalRows: detailedRows.length,
      detectedCount: detectedRows.length,
    };

    return nextReport;
  }

  return {
    buildManualTranscriptionIntroMarkup,
    buildManualTranscriptionLookupMarkup,
    buildManualTranscriptionResultFieldMarkup,
    buildManualTranscriptionTargetFieldMarkup,
    canonicalizeResultLabel,
    createManualTranscriptionReport,
    createManualTranscriptionUiModel,
    getManualTranscriptionPathogenOptions,
    getManualTranscriptionResistanceOptions,
    normalizeManualTranscriptionReport,
    resolveManualTranscriptionStatus,
  };
});
