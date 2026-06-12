function toPositiveInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const numeric = Math.floor(Number(value || 0) || 0);
  if (!Number.isFinite(numeric) || numeric < min) return fallback;
  return Math.min(max, numeric);
}

function toIsoString(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function addSeconds(isoValue, seconds) {
  const base = toIsoString(isoValue);
  if (!base) return "";
  const next = new Date(base);
  next.setSeconds(next.getSeconds() + Math.max(1, Math.floor(Number(seconds || 0) || 0)));
  return next.toISOString();
}

function isDueAtOrBefore(isoValue, nowIso) {
  const dueAt = toIsoString(isoValue);
  const current = toIsoString(nowIso) || new Date().toISOString();
  if (!dueAt) return true;
  return new Date(dueAt).getTime() <= new Date(current).getTime();
}

function normalizeReceiptConfig(config = {}) {
  return {
    pdfDir: String(config.pdfDir || "").trim() || "pharmd-pdf2",
    receiptIntervalSec: toPositiveInt(config.receiptIntervalSec, 1200, { min: 60, max: 86400 }),
    receiptMaxChecks: toPositiveInt(config.receiptMaxChecks, 5, { min: 1, max: 100 }),
  };
}

function resolveReceiptState(pharmd, config = {}) {
  const current = pharmd && typeof pharmd === "object" ? pharmd : {};
  const normalizedConfig = normalizeReceiptConfig(config);
  const sentAt = toIsoString(current.sentAt || current.submittedAt || current.queuedAt || "");
  const autoCheckCount = toPositiveInt(current.receiptAutoCheckCount, 0, { min: 0, max: 1000 });
  const manualCheckCount = toPositiveInt(current.receiptManualCheckCount, 0, { min: 0, max: 1000 });
  const receiptIntervalSec = toPositiveInt(
    current.receiptIntervalSec,
    normalizedConfig.receiptIntervalSec,
    { min: 60, max: 86400 }
  );
  const receiptMaxChecks = toPositiveInt(
    current.receiptMaxChecks,
    normalizedConfig.receiptMaxChecks,
    { min: 1, max: 1000 }
  );
  const reportReceivedAt = toIsoString(current.reportReceivedAt || current.receivedAt || current.pdfReceivedAt || "");
  const nextCheckAt = toIsoString(current.receiptNextCheckAt || "")
    || (reportReceivedAt ? "" : addSeconds(sentAt, receiptIntervalSec));
  const pollingStatus = String(current.receiptPollingStatus || "").trim().toLowerCase()
    || (reportReceivedAt ? "matched" : autoCheckCount >= receiptMaxChecks ? "exhausted" : "pending");

  return {
    pdfDir: String(current.receiptRemoteDir || normalizedConfig.pdfDir).trim() || normalizedConfig.pdfDir,
    receiptIntervalSec,
    receiptMaxChecks,
    autoCheckCount,
    manualCheckCount,
    sentAt,
    reportReceivedAt,
    nextCheckAt,
    lastCheckedAt: toIsoString(current.receiptLastCheckedAt || ""),
    lastCheckResult: String(current.receiptLastCheckResult || "").trim().toLowerCase(),
    lastCheckSource: String(current.receiptLastCheckSource || "").trim().toLowerCase(),
    lastError: String(current.receiptLastError || "").trim(),
    pollingStatus,
    pollingStoppedAt: toIsoString(current.receiptPollingStoppedAt || ""),
  };
}

function initializeReceiptTracking(existingPharmd, config = {}, sentAt = new Date().toISOString()) {
  const state = resolveReceiptState(existingPharmd, config);
  const normalizedSentAt = toIsoString(sentAt) || new Date().toISOString();
  return {
    receiptRemoteDir: state.pdfDir,
    receiptIntervalSec: state.receiptIntervalSec,
    receiptMaxChecks: state.receiptMaxChecks,
    receiptAutoCheckCount: 0,
    receiptManualCheckCount: 0,
    receiptLastCheckedAt: "",
    receiptLastCheckSource: "",
    receiptLastCheckResult: "pending",
    receiptLastError: "",
    receiptNextCheckAt: addSeconds(normalizedSentAt, state.receiptIntervalSec),
    receiptPollingStatus: "pending",
    receiptPollingStoppedAt: "",
    receivedAt: "",
    pdfReceivedAt: "",
    reportReceivedAt: "",
    reportReceivedFileName: "",
    reportReceivedRemotePath: "",
    reportReceivedAccession: "",
    reportReceivedSource: "",
    receivedReport: null,
  };
}

function hasReceivedReceipt(pharmd) {
  const state = resolveReceiptState(pharmd);
  return Boolean(state.reportReceivedAt);
}

function isEligibleForReceiptChecks(order) {
  const pharmd = order?.pharmd && typeof order.pharmd === "object" ? order.pharmd : {};
  const sendStatus = String(pharmd?.sendStatus || pharmd?.deliveryStatus || pharmd?.status || "").trim().toLowerCase();
  const wasSent = Boolean(
    pharmd?.sentAt
    || pharmd?.submittedAt
    || ["sent", "uploaded", "delivered", "transmitted", "received"].includes(sendStatus)
  );
  const accession = String(order?.accessionNo || order?.accession || "").trim();
  return Boolean(
    !pharmd?.skipPharmd
    && !pharmd?.completedAt
    && !order?.completedAt
    && wasSent
    && accession
  );
}

function shouldAutoCheckReceipt(order, config = {}, nowIso = new Date().toISOString(), force = false) {
  if (!isEligibleForReceiptChecks(order)) return false;
  const pharmd = order?.pharmd && typeof order.pharmd === "object" ? order.pharmd : {};
  const state = resolveReceiptState(pharmd, config);
  if (state.reportReceivedAt || state.pollingStatus === "matched") return false;
  if (state.autoCheckCount >= state.receiptMaxChecks) return false;
  return force || isDueAtOrBefore(state.nextCheckAt, nowIso);
}

function listReceiptCandidates(orders, config = {}, {
  orderIds = null,
  mode = "auto",
  nowIso = new Date().toISOString(),
  force = false,
} = {}) {
  const idSet = Array.isArray(orderIds) && orderIds.length
    ? new Set(orderIds.map((value) => String(value || "").trim()).filter(Boolean))
    : null;
  const candidates = [];
  (Array.isArray(orders) ? orders : []).forEach((order) => {
    const orderId = String(order?.orderId || "").trim();
    if (!orderId) return;
    if (idSet && !idSet.has(orderId)) return;
    if (mode === "manual") {
      if (!isEligibleForReceiptChecks(order)) return;
      if (hasReceivedReceipt(order?.pharmd)) return;
      candidates.push(order);
      return;
    }
    if (shouldAutoCheckReceipt(order, config, nowIso, force)) {
      candidates.push(order);
    }
  });
  return candidates;
}

function applyReceiptMiss(existingPharmd, config = {}, {
  checkedAt = new Date().toISOString(),
  mode = "auto",
  errorMessage = "",
} = {}) {
  const state = resolveReceiptState(existingPharmd, config);
  const normalizedCheckedAt = toIsoString(checkedAt) || new Date().toISOString();
  if (mode === "manual") {
    const exhausted = state.autoCheckCount >= state.receiptMaxChecks;
    return {
      receiptAutoCheckCount: state.autoCheckCount,
      receiptManualCheckCount: state.manualCheckCount + 1,
      receiptLastCheckedAt: normalizedCheckedAt,
      receiptLastCheckSource: "manual",
      receiptLastCheckResult: errorMessage ? "error" : "not_found",
      receiptLastError: String(errorMessage || "").trim(),
      receiptNextCheckAt: exhausted
        ? ""
        : (state.nextCheckAt || addSeconds(normalizedCheckedAt, state.receiptIntervalSec)),
      receiptPollingStatus: exhausted ? "exhausted" : "pending",
      receiptPollingStoppedAt: exhausted ? (state.pollingStoppedAt || normalizedCheckedAt) : "",
    };
  }

  const nextAutoCheckCount = state.autoCheckCount + 1;
  const exhausted = nextAutoCheckCount >= state.receiptMaxChecks;
  return {
    receiptAutoCheckCount: nextAutoCheckCount,
    receiptManualCheckCount: state.manualCheckCount,
    receiptLastCheckedAt: normalizedCheckedAt,
    receiptLastCheckSource: "auto",
    receiptLastCheckResult: errorMessage ? "error" : "not_found",
    receiptLastError: String(errorMessage || "").trim(),
    receiptNextCheckAt: exhausted ? "" : addSeconds(normalizedCheckedAt, state.receiptIntervalSec),
    receiptPollingStatus: exhausted ? "exhausted" : "pending",
    receiptPollingStoppedAt: exhausted ? normalizedCheckedAt : "",
  };
}

function applyReceiptMatch(existingPharmd, config = {}, {
  checkedAt = new Date().toISOString(),
  receivedAt = "",
  fileName = "",
  remotePath = "",
  accession = "",
  storedFile = null,
  source = "pharmd_sftp_poll",
  mode = "auto",
} = {}) {
  const state = resolveReceiptState(existingPharmd, config);
  const normalizedCheckedAt = toIsoString(checkedAt) || new Date().toISOString();
  const normalizedReceivedAt = toIsoString(receivedAt) || normalizedCheckedAt;
  return {
    status: "received",
    sendStatus: "received",
    deliveryStatus: "received",
    receivedAt: normalizedReceivedAt,
    reportReceivedAt: normalizedReceivedAt,
    reportReceivedFileName: String(fileName || "").trim(),
    reportReceivedRemotePath: String(remotePath || "").trim(),
    reportReceivedAccession: String(accession || "").trim(),
    reportReceivedSource: String(source || "").trim() || "pharmd_sftp_poll",
    receivedReport: storedFile && typeof storedFile === "object" ? storedFile : null,
    receiptAutoCheckCount: mode === "auto" ? state.autoCheckCount + 1 : state.autoCheckCount,
    receiptManualCheckCount: mode === "manual" ? state.manualCheckCount + 1 : state.manualCheckCount,
    receiptLastCheckedAt: normalizedCheckedAt,
    receiptLastCheckSource: mode === "manual" ? "manual" : "auto",
    receiptLastCheckResult: "matched",
    receiptLastError: "",
    receiptNextCheckAt: "",
    receiptPollingStatus: "matched",
    receiptPollingStoppedAt: normalizedCheckedAt,
  };
}

function resolveNextReceiptDueAt(orders, config = {}) {
  let earliest = "";
  (Array.isArray(orders) ? orders : []).forEach((order) => {
    if (!isEligibleForReceiptChecks(order)) return;
    const pharmd = order?.pharmd && typeof order.pharmd === "object" ? order.pharmd : {};
    const state = resolveReceiptState(pharmd, config);
    if (state.reportReceivedAt || state.autoCheckCount >= state.receiptMaxChecks) return;
    const candidate = state.nextCheckAt || addSeconds(state.sentAt, state.receiptIntervalSec);
    if (!candidate) return;
    if (!earliest || new Date(candidate).getTime() < new Date(earliest).getTime()) {
      earliest = candidate;
    }
  });
  return earliest;
}

module.exports = {
  applyReceiptMatch,
  applyReceiptMiss,
  hasReceivedReceipt,
  initializeReceiptTracking,
  isEligibleForReceiptChecks,
  listReceiptCandidates,
  normalizeReceiptConfig,
  resolveNextReceiptDueAt,
  resolveReceiptState,
};
