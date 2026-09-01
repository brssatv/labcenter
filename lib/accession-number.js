const { DEFAULT_APP_TIME_ZONE, resolveAppTimeZone } = require("./app-time-zone");

const DEFAULT_PANEL_PREFIX_BY_ID = {
  attachment: "AT",
  "gastrointestinal-panel": "GI",
  "nail-panel": "NL",
  "basic-flu-panel": "BF",
  "final-report": "FR",
  "upload-pdf": "UP",
  "eye-panel": "EY",
  "molecular-test": "MT",
  "wound-panel": "WN",
  "respiratory-pathogens-panel": "RP",
  "sti-panel": "ST",
  "uti-pcr-panel": "UU",
  "womens-health-panel": "WH",
};

const DEFAULT_PANEL_MATCHERS = [
  { id: "attachment", names: ["Attachment"] },
  { id: "gastrointestinal-panel", names: ["Gastrointestinal Panel"] },
  { id: "nail-panel", names: ["Nail Panel"] },
  { id: "basic-flu-panel", names: ["BASIC FLU PANEL"] },
  { id: "final-report", names: ["Final Report", "ChoicePharmD"] },
  { id: "upload-pdf", names: ["Upload PDF"] },
  { id: "eye-panel", names: ["Eye Panel"] },
  { id: "molecular-test", names: ["Molecular Test"] },
  { id: "wound-panel", names: ["Wound Panel"] },
  { id: "respiratory-pathogens-panel", names: ["Respiratory Pathogens Panel"] },
  { id: "sti-panel", names: ["Sexually Transmitted Infection Panel"] },
  { id: "uti-pcr-panel", names: ["Urinary Tract Infection PCR Panel"] },
  { id: "womens-health-panel", names: ["Women's Health Panel"] },
];

const DEFAULT_ACCESSION_TIME_ZONE = DEFAULT_APP_TIME_ZONE;

const dateFormatterCache = new Map();

function normalizePanelKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeAccessionPrefix(value, { fallback = "GN", maxLength = 6 } = {}) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, Math.max(1, Math.floor(Number(maxLength || 6) || 6)));
  return normalized || fallback;
}

function resolveAccessionTimeZone(timeZone = DEFAULT_ACCESSION_TIME_ZONE) {
  return resolveAppTimeZone(timeZone);
}

function getAccessionDateFormatter(timeZone = DEFAULT_ACCESSION_TIME_ZONE) {
  const resolvedTimeZone = resolveAccessionTimeZone(timeZone);
  if (!dateFormatterCache.has(resolvedTimeZone)) {
    dateFormatterCache.set(
      resolvedTimeZone,
      new Intl.DateTimeFormat("en-US", {
        timeZone: resolvedTimeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    );
  }
  return dateFormatterCache.get(resolvedTimeZone);
}

function resolveAccessionDateParts(createdAt, { timeZone = DEFAULT_ACCESSION_TIME_ZONE } = {}) {
  const parsed = new Date(createdAt || "");
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const formatter = getAccessionDateFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  return { year, month, day };
}

function formatAccessionDate(createdAt, options = {}) {
  const { year, month, day } = resolveAccessionDateParts(createdAt, options);
  return `${month}${day}${year.slice(-2)}`;
}

function buildAccessionCounterName(createdAt, options = {}) {
  const { year, month, day } = resolveAccessionDateParts(createdAt, options);
  return `accession_sequence:${year}-${month}-${day}`;
}

function encodeSeriesLabel(seriesIndex) {
  let current = Math.max(0, Math.floor(Number(seriesIndex || 0) || 0));
  let label = "";
  do {
    label = String.fromCharCode(65 + (current % 26)) + label;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return label;
}

function splitAccessionSequence(dailySequence) {
  const sequence = Math.max(1, Math.floor(Number(dailySequence || 1) || 1));
  const zeroBased = sequence - 1;
  const seriesIndex = Math.floor(zeroBased / 99);
  const sequenceWithinSeries = (zeroBased % 99) + 1;
  return {
    seriesLabel: encodeSeriesLabel(seriesIndex),
    serial: String(sequenceWithinSeries).padStart(2, "0"),
  };
}

function resolveDefaultPrefixByName(serviceName) {
  const normalizedName = normalizePanelKey(
    String(serviceName || "")
      .split(",")
      .map((value) => value.trim())
      .find(Boolean) || ""
  );
  if (!normalizedName) return "";
  const matched = DEFAULT_PANEL_MATCHERS.find((entry) => {
    return entry.names.some((name) => normalizePanelKey(name) === normalizedName);
  });
  if (!matched) return "";
  return DEFAULT_PANEL_PREFIX_BY_ID[matched.id] || "";
}

function resolveAccessionPrefix({ explicitPrefix = "", serviceLine = null } = {}) {
  const directPrefix = normalizeAccessionPrefix(explicitPrefix, { fallback: "" });
  if (directPrefix) return directPrefix;

  const line = serviceLine && typeof serviceLine === "object" ? serviceLine : {};
  const servicePrefix = normalizeAccessionPrefix(
    line.accessionPrefix || line.prefix || "",
    { fallback: "" }
  );
  if (servicePrefix) return servicePrefix;

  if (Array.isArray(line.panelIds)) {
    const matchedPanelId = line.panelIds.find((panelId) => DEFAULT_PANEL_PREFIX_BY_ID[String(panelId || "").trim()]);
    if (matchedPanelId) {
      return normalizeAccessionPrefix(DEFAULT_PANEL_PREFIX_BY_ID[String(matchedPanelId || "").trim()]);
    }
  }

  const defaultPrefix = resolveDefaultPrefixByName(line.serviceName);
  if (defaultPrefix) return normalizeAccessionPrefix(defaultPrefix);

  return "GN";
}

function buildAccessionNumber({
  prefix = "",
  createdAt = new Date().toISOString(),
  dailySequence = 1,
  timeZone = DEFAULT_ACCESSION_TIME_ZONE,
} = {}) {
  const normalizedPrefix = normalizeAccessionPrefix(prefix);
  const datePart = formatAccessionDate(createdAt, { timeZone });
  const { seriesLabel, serial } = splitAccessionSequence(dailySequence);
  return `${normalizedPrefix}${datePart}${seriesLabel}${serial}`;
}

module.exports = {
  DEFAULT_ACCESSION_TIME_ZONE,
  DEFAULT_PANEL_PREFIX_BY_ID,
  buildAccessionCounterName,
  buildAccessionNumber,
  encodeSeriesLabel,
  formatAccessionDate,
  normalizeAccessionPrefix,
  resolveAccessionDateParts,
  resolveAccessionPrefix,
  resolveAccessionTimeZone,
  splitAccessionSequence,
};
