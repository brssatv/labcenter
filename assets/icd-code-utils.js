(function initIcdCodeUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LabCenterIcdCodeUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const ICD_EXTRACT_RE = /\b([A-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4}|[0-9A-Z]{0,4})?)\b/i;
  const ICD_CANONICAL_RE = /^[A-Z][0-9][0-9A-Z](?:[0-9A-Z]{0,4})$/;

  function extractIcdCodeToken(value) {
    const raw = String(value || "").trim().toUpperCase();
    if (!raw) return "";
    const matched = raw.match(ICD_EXTRACT_RE);
    if (matched?.[1]) return matched[1];
    return raw.split(/\s+/)[0].replace(/[^A-Z0-9.]/g, "");
  }

  function normalizeIcdCode(value) {
    const token = extractIcdCodeToken(value);
    if (!token) return "";
    return token.replace(/\./g, "").replace(/[^A-Z0-9]/g, "").toUpperCase();
  }

  function isLikelyIcdCode(value) {
    const canonical = normalizeIcdCode(value);
    return ICD_CANONICAL_RE.test(canonical);
  }

  function formatIcdCode(value) {
    const canonical = normalizeIcdCode(value);
    if (!canonical) return "";
    if (canonical.length <= 3) return canonical;
    return `${canonical.slice(0, 3)}.${canonical.slice(3)}`;
  }

  function compareIcdCodes(left, right) {
    return normalizeIcdCode(left).localeCompare(normalizeIcdCode(right));
  }

  function normalizeIcdCodeList(values) {
    const source = Array.isArray(values)
      ? values
      : typeof values === "string"
      ? values.split(/[\n,;]+/)
      : [];
    const seen = new Set();
    const normalized = [];
    source.forEach((value) => {
      const canonical = normalizeIcdCode(value);
      if (!canonical || seen.has(canonical)) return;
      seen.add(canonical);
      normalized.push(canonical);
    });
    return normalized;
  }

  function formatIcdCodeList(values) {
    return normalizeIcdCodeList(values).map((code) => formatIcdCode(code));
  }

  function sanitizeIcdCatalogRecord(raw) {
    const source = Array.isArray(raw)
      ? { code: raw[0], description: raw[1] }
      : raw && typeof raw === "object"
      ? raw
      : { code: raw, description: "" };
    const code = normalizeIcdCode(source?.code || source?.canonicalCode || source?.value || "");
    if (!code) return null;
    return {
      code,
      description: String(source?.description || "").trim(),
    };
  }

  function buildIcdSearchText(record, extraValues = []) {
    const formattedCode = formatIcdCode(record?.code || "");
    const parts = [
      record?.code || "",
      formattedCode,
      record?.description || "",
      ...(Array.isArray(extraValues) ? extraValues : [extraValues]),
    ];
    return parts
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
      .join(" ");
  }

  function matchesIcdSearch(record, query, extraValues = []) {
    const rawQuery = String(query || "").trim();
    if (!rawQuery) return true;

    const canonicalQuery = normalizeIcdCode(rawQuery);
    if (canonicalQuery && /^[A-Z][0-9]/.test(canonicalQuery)) {
      if (String(record?.code || "").includes(canonicalQuery)) return true;
    }

    return buildIcdSearchText(record, extraValues).includes(rawQuery.toLowerCase());
  }

  function buildIcdCatalogIndex(records) {
    const byCode = new Map();
    const entries = [];

    (Array.isArray(records) ? records : []).forEach((raw) => {
      const record = sanitizeIcdCatalogRecord(raw);
      if (!record || byCode.has(record.code)) return;
      const entry = {
        code: record.code,
        description: record.description,
        formattedCode: formatIcdCode(record.code),
        searchText: buildIcdSearchText(record),
      };
      byCode.set(entry.code, entry);
      entries.push(entry);
    });

    entries.sort((left, right) => compareIcdCodes(left.code, right.code));
    return { entries, byCode };
  }

  function parseIcdDatasetText(rawText) {
    return String(rawText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const matched = line.match(/^([A-Z][0-9][0-9A-Z.]{1,7})\s+(.+)$/i);
        if (!matched) return null;
        return sanitizeIcdCatalogRecord({
          code: matched[1],
          description: matched[2],
        });
      })
      .filter(Boolean);
  }

  return {
    buildIcdCatalogIndex,
    buildIcdSearchText,
    compareIcdCodes,
    extractIcdCodeToken,
    formatIcdCode,
    formatIcdCodeList,
    isLikelyIcdCode,
    matchesIcdSearch,
    normalizeIcdCode,
    normalizeIcdCodeList,
    parseIcdDatasetText,
    sanitizeIcdCatalogRecord,
  };
});
