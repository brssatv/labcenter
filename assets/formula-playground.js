(function initFormulaPlayground(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LabCenterFormulaPlayground = api;
})(typeof globalThis !== "undefined" ? globalThis : this, (root) => {
  const formulaPlaygroundStorageKey = "labcenter.formula-playground.v1";

  function createDefaultFormulaPlaygroundData() {
    return {
      selected_gene: "E Gene",
      selected_organism: "SARS-CoV-2",
      selected_pathogen: "SARS-CoV-2",
      genes: [
        { label: "E Gene", ct: 31.2, result: "Detected" },
        { label: "N Gene", ct: 32.8, result: "Detected" },
        { label: "Orf1ab", ct: 35.6, result: "Not Detected" },
      ],
      organisms: [
        { label: "SARS-CoV-2", detected: true, result: "Detected" },
        { label: "Influenza A", detected: false, result: "Not Detected" },
      ],
      pathogens: [
        { label: "SARS-CoV-2", result: "Detected", ct: 31.2 },
        { label: "Influenza A", result: "Not Detected", ct: null },
      ],
    };
  }

  function stringifyFormulaPlaygroundData(data) {
    return JSON.stringify(data, null, 2);
  }

  const defaultFormulaPlaygroundDraft = Object.freeze({
    dataInput: stringifyFormulaPlaygroundData(createDefaultFormulaPlaygroundData()),
    formulaExpression: [
      "IF(",
      "  COUNT(",
      '    @Gene("E Gene").ct <= 33,',
      '    @Gene("N Gene").ct <= 33,',
      '    @Gene("Orf1ab").ct <= 33',
      "  ) >= 2,",
      '  "Positive",',
      '  "Negative"',
      ")",
    ].join("\n"),
  });

  let memoryDraft = cloneFormulaPlaygroundDraft(defaultFormulaPlaygroundDraft);

  function cloneFormulaPlaygroundDraft(draft) {
    const source = draft || defaultFormulaPlaygroundDraft;
    return {
      dataInput: String(source.dataInput || ""),
      formulaExpression: String(source.formulaExpression || ""),
    };
  }

  function getPlaygroundStorage() {
    try {
      return root?.localStorage || null;
    } catch {
      return null;
    }
  }

  function normalizeDisplayText(value, fallback = "") {
    const text = String(value || fallback || "").trim();
    return text || String(fallback || "").trim();
  }

  function normalizeCtValue(value, fallback = null) {
    if (value === null || value === undefined || value === "") {
      return fallback === null || fallback === undefined ? null : Number(fallback);
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback === null || fallback === undefined ? null : Number(fallback));
  }

  function normalizeDetectedValue(value, fallback = false) {
    if (typeof value === "boolean") return value;
    const text = String(value === null || value === undefined ? fallback : value).trim().toLowerCase();
    if (!text) return Boolean(fallback);
    return text === "true" || text === "1" || text === "yes" || text === "detected" || text === "positive";
  }

  function normalizeEntityKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function normalizeGeneItem(item, fallback = {}) {
    return {
      key: normalizeEntityKey(item?.key || item?.label || fallback.key || fallback.label || "gene"),
      label: normalizeDisplayText(item?.label, fallback.label || "Gene"),
      ct: normalizeCtValue(item?.ct, fallback.ct ?? null),
      result: normalizeDisplayText(item?.result, fallback.result || "Not Detected"),
    };
  }

  function normalizeOrganismItem(item, fallback = {}) {
    return {
      key: normalizeEntityKey(item?.key || item?.label || fallback.key || fallback.label || "organism"),
      label: normalizeDisplayText(item?.label, fallback.label || "Organism"),
      detected: normalizeDetectedValue(item?.detected, fallback.detected ?? false),
      result: normalizeDisplayText(item?.result, fallback.result || "Not Detected"),
    };
  }

  function normalizePathogenItem(item, fallback = {}) {
    return {
      key: normalizeEntityKey(item?.key || item?.label || fallback.key || fallback.label || "pathogen"),
      label: normalizeDisplayText(item?.label, fallback.label || "Pathogen"),
      ct: normalizeCtValue(item?.ct, fallback.ct ?? null),
      result: normalizeDisplayText(item?.result, fallback.result || "Not Detected"),
    };
  }

  function buildLegacyDataInput(rawDraft) {
    const fallback = createDefaultFormulaPlaygroundData();
    const genes = Array.isArray(rawDraft?.genes)
      ? rawDraft.genes.map((item, index) => normalizeGeneItem(item, fallback.genes[index] || {}))
      : fallback.genes;
    const organisms = Array.isArray(rawDraft?.organisms)
      ? rawDraft.organisms.map((item, index) => normalizeOrganismItem(item, fallback.organisms[index] || {}))
      : fallback.organisms;
    const pathogens = organisms.map((item) => normalizePathogenItem({
      key: item.key,
      label: item.label,
      result: item.result,
      ct: null,
    }));
    const selectedGene = resolveEntityBySelector(genes, rawDraft?.selectedGeneKey, genes[0]?.label || fallback.selected_gene);
    const selectedOrganism = resolveEntityBySelector(
      organisms,
      rawDraft?.selectedOrganismKey,
      organisms[0]?.label || fallback.selected_organism
    );
    const selectedPathogen = resolveEntityBySelector(
      pathogens,
      rawDraft?.selectedPathogenKey || rawDraft?.selectedOrganismKey,
      pathogens[0]?.label || fallback.selected_pathogen
    );

    return stringifyFormulaPlaygroundData({
      selected_gene: selectedGene?.label || fallback.selected_gene,
      selected_organism: selectedOrganism?.label || fallback.selected_organism,
      selected_pathogen: selectedPathogen?.label || fallback.selected_pathogen,
      genes,
      organisms,
      pathogens,
    });
  }

  function normalizeFormulaPlaygroundDraft(rawDraft) {
    const base = cloneFormulaPlaygroundDraft(defaultFormulaPlaygroundDraft);
    return {
      dataInput: normalizeDisplayText(
        rawDraft?.dataInput,
        rawDraft && (Array.isArray(rawDraft.genes) || Array.isArray(rawDraft.organisms))
          ? buildLegacyDataInput(rawDraft)
          : base.dataInput
      ),
      formulaExpression: normalizeDisplayText(rawDraft?.formulaExpression, base.formulaExpression),
    };
  }

  function createDefaultFormulaPlaygroundDraft() {
    return cloneFormulaPlaygroundDraft(defaultFormulaPlaygroundDraft);
  }

  function readFormulaPlaygroundDraft() {
    const storage = getPlaygroundStorage();
    if (storage) {
      try {
        const raw = storage.getItem(formulaPlaygroundStorageKey);
        if (raw) {
          memoryDraft = normalizeFormulaPlaygroundDraft(JSON.parse(raw));
          return cloneFormulaPlaygroundDraft(memoryDraft);
        }
      } catch {
        // Keep the in-memory fallback when storage cannot be read.
      }
    }
    return cloneFormulaPlaygroundDraft(memoryDraft);
  }

  function writeFormulaPlaygroundDraft(nextDraft) {
    const normalized = normalizeFormulaPlaygroundDraft(nextDraft);
    memoryDraft = cloneFormulaPlaygroundDraft(normalized);
    const storage = getPlaygroundStorage();
    if (storage) {
      try {
        storage.setItem(formulaPlaygroundStorageKey, JSON.stringify(memoryDraft));
      } catch {
        // Keep the in-memory draft even if storage is unavailable.
      }
    }
    return cloneFormulaPlaygroundDraft(memoryDraft);
  }

  function resetFormulaPlaygroundDraft() {
    memoryDraft = cloneFormulaPlaygroundDraft(defaultFormulaPlaygroundDraft);
    const storage = getPlaygroundStorage();
    if (storage) {
      try {
        storage.removeItem(formulaPlaygroundStorageKey);
      } catch {
        // Ignore storage cleanup failures.
      }
    }
    return cloneFormulaPlaygroundDraft(memoryDraft);
  }

  function normalizeLookupToken(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function isDetectedResult(value) {
    if (typeof value === "boolean") return value;
    const normalized = normalizeLookupToken(value);
    if (!normalized) return false;
    if (normalized.includes("notdetected") || normalized.includes("negative")) return false;
    return normalized.includes("detected") || normalized.includes("positive") || normalized === "true";
  }

  function parseFormulaPlaygroundDataInput(dataInput) {
    let parsed;
    try {
      parsed = JSON.parse(String(dataInput || ""));
    } catch (error) {
      throw new Error(`Data Input must be valid JSON. ${error?.message || ""}`.trim());
    }

    const fallback = createDefaultFormulaPlaygroundData();
    const genes = Array.isArray(parsed?.genes)
      ? parsed.genes.map((item, index) => normalizeGeneItem(item, fallback.genes[index] || {}))
      : fallback.genes.map((item) => normalizeGeneItem(item, item));
    const organisms = Array.isArray(parsed?.organisms)
      ? parsed.organisms.map((item, index) => normalizeOrganismItem(item, fallback.organisms[index] || {}))
      : fallback.organisms.map((item) => normalizeOrganismItem(item, item));
    const pathogens = Array.isArray(parsed?.pathogens)
      ? parsed.pathogens.map((item, index) => normalizePathogenItem(item, fallback.pathogens[index] || {}))
      : fallback.pathogens.map((item) => normalizePathogenItem(item, item));

    const selectedGeneLabel = normalizeDisplayText(parsed?.selected_gene, genes[0]?.label || fallback.selected_gene);
    const selectedOrganismLabel = normalizeDisplayText(parsed?.selected_organism, organisms[0]?.label || fallback.selected_organism);
    const selectedPathogenLabel = normalizeDisplayText(parsed?.selected_pathogen, pathogens[0]?.label || fallback.selected_pathogen);

    return {
      selected_gene: selectedGeneLabel,
      selected_organism: selectedOrganismLabel,
      selected_pathogen: selectedPathogenLabel,
      genes,
      organisms,
      pathogens,
    };
  }

  function resolveEntityBySelector(items, selectorValue, selectedValue) {
    const list = Array.isArray(items) ? items : [];
    const selected = list.find((item) => normalizeLookupToken(item.label) === normalizeLookupToken(selectedValue)) || list[0] || null;
    const rawSelector = String(selectorValue || "").trim();
    const normalizedSelector = normalizeLookupToken(rawSelector);
    if (!rawSelector || normalizedSelector.startsWith("selected")) return selected;
    return (
      list.find((item) => item.key === normalizeEntityKey(rawSelector))
      || list.find((item) => normalizeLookupToken(item.label) === normalizedSelector)
      || selected
    );
  }

  function createFormulaHelpers(parsedData) {
    return {
      IF(condition, truthyValue, falsyValue) {
        return condition ? truthyValue : falsyValue;
      },
      COUNT(...items) {
        return items.flat().filter(Boolean).length;
      },
      ANY(...items) {
        return items.flat().some(Boolean);
      },
      ALL(...items) {
        return items.flat().every(Boolean);
      },
      COALESCE(...items) {
        return items.find((item) => item !== null && item !== undefined && item !== "");
      },
      ROUND(value, decimals = 0) {
        const amount = Number(value);
        const precision = Number.isInteger(Number(decimals)) ? Number(decimals) : 0;
        if (!Number.isFinite(amount)) return null;
        return Number(amount.toFixed(Math.max(0, precision)));
      },
      LOWER(value) {
        return String(value === null || value === undefined ? "" : value).toLowerCase();
      },
      UPPER(value) {
        return String(value === null || value === undefined ? "" : value).toUpperCase();
      },
      gene(selectorValue) {
        const entity = resolveEntityBySelector(parsedData.genes, selectorValue, parsedData.selected_gene);
        return entity ? { ...entity } : { key: "", label: "", ct: null, result: "", detected: false };
      },
      organism(selectorValue) {
        const entity = resolveEntityBySelector(parsedData.organisms, selectorValue, parsedData.selected_organism);
        return entity ? { ...entity } : { key: "", label: "", detected: false, result: "" };
      },
      pathogen(selectorValue) {
        const entity = resolveEntityBySelector(parsedData.pathogens, selectorValue, parsedData.selected_pathogen);
        return entity ? { ...entity } : { key: "", label: "", ct: null, result: "" };
      },
    };
  }

  function escapeExpressionLiterals(source) {
    return source
      .replace(/\bAND\b/gi, "&&")
      .replace(/\bOR\b/gi, "||")
      .replace(/\bNOT\b/gi, "!")
      .replace(/\bTRUE\b/gi, "true")
      .replace(/\bFALSE\b/gi, "false")
      .replace(/\bNULL\b/gi, "null")
      .replace(/<>/g, "!=")
      .replace(/(^|[^<>=!])=([^=])/g, "$1==$2");
  }

  function transformPlaygroundExpression(source) {
    return escapeExpressionLiterals(String(source || ""))
      .replace(/@Gene\(([^)]+)\)\.([A-Za-z_][A-Za-z0-9_]*)/g, 'gene($1).$2')
      .replace(/@Gene\(([^)]+)\)/g, 'gene($1)')
      .replace(/@Organism\(([^)]+)\)\.([A-Za-z_][A-Za-z0-9_]*)/g, 'organism($1).$2')
      .replace(/@Organism\(([^)]+)\)/g, 'organism($1)')
      .replace(/@Pathogen\(([^)]+)\)\.([A-Za-z_][A-Za-z0-9_]*)/g, 'pathogen($1).$2')
      .replace(/@Pathogen\(([^)]+)\)/g, 'pathogen($1)')
      .replace(/@Formula\(\)\.([A-Za-z_][A-Za-z0-9_]*)/g, "formula.$1");
  }

  function assertSafeExpression(source) {
    const text = String(source || "");
    const blockedPatterns = [
      /;/,
      /\bfunction\b/i,
      /=>/,
      /\bwhile\b/i,
      /\bfor\b/i,
      /\bclass\b/i,
      /\bimport\b/i,
      /\bexport\b/i,
      /\bwindow\b/i,
      /\bdocument\b/i,
      /\bglobalThis\b/i,
      /\bconstructor\b/i,
      /\bprototype\b/i,
      /__proto__/i,
      /\bnew\b/i,
      /[{}`]/,
    ];

    if (blockedPatterns.some((pattern) => pattern.test(text))) {
      throw new Error("Only safe expression syntax is allowed in the playground preview.");
    }
  }

  function evaluatePlaygroundExpression(source, parsedData, formulaContext) {
    assertSafeExpression(source);
    const transformed = transformPlaygroundExpression(source);
    const evaluator = Function(
      "helpers",
      "formula",
      `
        const {
          IF,
          COUNT,
          ANY,
          ALL,
          COALESCE,
          ROUND,
          LOWER,
          UPPER,
          gene,
          organism,
          pathogen
        } = helpers;
        const selected_gene = formula?.selected_gene ?? "";
        const selected_organism = formula?.selected_organism ?? "";
        const selected_pathogen = formula?.selected_pathogen ?? "";
        const formula_status = formula?.status ?? null;
        const formula_value = formula?.value ?? null;
        return (${transformed});
      `
    );

    return evaluator(createFormulaHelpers(parsedData), formulaContext || {});
  }

  function normalizeFormulaPreviewValue(value) {
    if (typeof value === "boolean") {
      return {
        rawValue: value,
        status: value ? "Positive" : "Negative",
        truthy: value,
        displayValue: value ? "Positive" : "Negative",
      };
    }

    if (typeof value === "number") {
      return {
        rawValue: value,
        status: String(value),
        truthy: Boolean(value),
        displayValue: String(value),
      };
    }

    const text = String(value === null || value === undefined ? "" : value).trim();
    if (!text) {
      return {
        rawValue: value,
        status: "Empty",
        truthy: false,
        displayValue: "",
      };
    }

    const normalized = normalizeLookupToken(text);
    const truthy = normalized === "positive" || normalized === "detected" || normalized === "true" || normalized === "yes";
    return {
      rawValue: value,
      status: text,
      truthy,
      displayValue: text,
    };
  }

  function buildOutputRows(parsedData, formulaResult) {
    const geneRows = parsedData.genes.map((item) => ({
      kind: "gene",
      label: item.label,
      ct: item.ct,
      result: item.result,
      detected: isDetectedResult(item.result),
      selected: normalizeLookupToken(item.label) === normalizeLookupToken(parsedData.selected_gene),
      formula_status: formulaResult.status,
    }));
    const organismRows = parsedData.organisms.map((item) => ({
      kind: "organism",
      label: item.label,
      ct: null,
      result: item.result,
      detected: item.detected,
      selected: normalizeLookupToken(item.label) === normalizeLookupToken(parsedData.selected_organism),
      formula_status: formulaResult.status,
    }));
    const pathogenRows = parsedData.pathogens.map((item) => ({
      kind: "pathogen",
      label: item.label,
      ct: item.ct,
      result: item.result,
      detected: isDetectedResult(item.result),
      selected: normalizeLookupToken(item.label) === normalizeLookupToken(parsedData.selected_pathogen),
      formula_status: formulaResult.status,
    }));
    return [...pathogenRows, ...organismRows, ...geneRows];
  }

  function buildFormulaPlaygroundOutput(preview) {
    return {
      formula: preview.draft.formulaExpression,
      evaluated_result: preview.formulaResult.displayValue || "",
      selected_gene: preview.selectedGene,
      selected_organism: preview.selectedOrganism,
      selected_pathogen: preview.selectedPathogen,
      output_rows: preview.outputRows,
    };
  }

  function buildFormulaPlaygroundPreview(inputDraft) {
    const draft = normalizeFormulaPlaygroundDraft(inputDraft || readFormulaPlaygroundDraft());
    let parsedData = null;
    let dataError = "";

    try {
      parsedData = parseFormulaPlaygroundDataInput(draft.dataInput);
    } catch (error) {
      dataError = error?.message || "Unable to parse the data input.";
    }

    const selectedGene = parsedData
      ? resolveEntityBySelector(parsedData.genes, "selected_gene", parsedData.selected_gene)
      : null;
    const selectedOrganism = parsedData
      ? resolveEntityBySelector(parsedData.organisms, "selected_organism", parsedData.selected_organism)
      : null;
    const selectedPathogen = parsedData
      ? resolveEntityBySelector(parsedData.pathogens, "selected_pathogen", parsedData.selected_pathogen)
      : null;

    let formulaResult = {
      rawValue: null,
      status: "Error",
      truthy: false,
      displayValue: "",
      error: dataError,
      transformedExpression: transformPlaygroundExpression(draft.formulaExpression),
    };

    if (parsedData && !dataError) {
      try {
        const rawValue = evaluatePlaygroundExpression(draft.formulaExpression, parsedData, {
          selected_gene: parsedData.selected_gene,
          selected_organism: parsedData.selected_organism,
          selected_pathogen: parsedData.selected_pathogen,
          status: null,
          value: "",
        });
        formulaResult = {
          ...normalizeFormulaPreviewValue(rawValue),
          error: "",
          transformedExpression: transformPlaygroundExpression(draft.formulaExpression),
        };
      } catch (error) {
        formulaResult.error = error?.message || "Unable to evaluate the formula expression.";
      }
    }

    const outputRows = parsedData ? buildOutputRows(parsedData, formulaResult) : [];
    const outputObject = buildFormulaPlaygroundOutput({
      draft,
      formulaResult,
      selectedGene,
      selectedOrganism,
      selectedPathogen,
      outputRows,
    });

    return {
      draft,
      parsedData,
      dataError,
      selectedGene,
      selectedOrganism,
      selectedPathogen,
      formulaResult,
      outputRows,
      outputObject,
      outputText: JSON.stringify(outputObject, null, 2),
      helperTokens: [
        "@Gene(selected_gene).ct",
        '@Gene("E Gene").result',
        "@Organism(selected_organism).detected",
        "@Pathogen(selected_pathogen).result",
      ],
    };
  }

  return {
    createDefaultFormulaPlaygroundData,
    stringifyFormulaPlaygroundData,
    createDefaultFormulaPlaygroundDraft,
    readFormulaPlaygroundDraft,
    writeFormulaPlaygroundDraft,
    resetFormulaPlaygroundDraft,
    buildFormulaPlaygroundPreview,
  };
});
