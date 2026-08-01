const views = [
  {
    key: "dashboard",
    title: "Dashboard",
    subtitle: "Overview of your workspace.",
  },
  {
    key: "registration",
    title: "Requisition",
    subtitle: "Capture patient requisition demographics and insurance details.",
  },
  {
    key: "facility",
    title: "Facility",
    subtitle: "Manage facility information and provider context.",
  },
  {
    key: "patient-search",
    title: "Patient Search",
    subtitle: "Find patients by name, contact, and date of birth.",
  },
  {
    key: "order-history",
    title: "Order History",
    subtitle: "Review created orders and payment status.",
  },
  {
    key: "output-results",
    title: "Output Results",
    subtitle: "Track result queues for pending, review, completed, and rejected work.",
  },
  {
    key: "master-registry",
    title: "Master Registry",
    subtitle: "Canonical pathogen and virus reference registry.",
  },
  {
    key: "panel-master",
    title: "Panel Master",
    subtitle: "Review panel catalog, ICD mappings, and accession prefixes.",
  },
  {
    key: "formula-book",
    title: "Formula Book",
    subtitle: "Review modular formula references used across report workflows.",
  },
  {
    key: "admin-settings",
    title: "Admin Settings",
    subtitle: "Update protected application-wide settings.",
  },
  {
    key: "audit-log",
    title: "Audit Log",
    subtitle: "Review recent security and workflow activity.",
  },
];

const clientAccessViews = {
  report_view: ["dashboard", "order-history"],
  report_view_order: ["dashboard", "registration", "order-history"],
  no_login: [],
};

const facilityModalSections = [
  { key: "basic", label: "Basic Information" },
  { key: "payment", label: "Payment Configurations" },
  { key: "settings", label: "Account Settings" },
  { key: "access", label: "Login and Access" },
  { key: "org", label: "Org Hierarchy" },
];

const facilityProviderModalSections = [
  { key: "provider-info", label: "Provider Info" },
  { key: "configuration", label: "Configuration" },
  { key: "signature", label: "Signature" },
  { key: "provider-access", label: "Login and Access" },
];

const facilitySensitiveColumns = new Set(["portal_password_hash", "encrypted_reports_password"]);

function recordHasConfiguredPortalPassword(record) {
  return Boolean(
    record?.portal?.passwordConfigured || record?.portal_has_password || record?.portal?.passwordHash || record?.portal_password_hash
  );
}

const facilityTableColumnConfig = {
  accounts: [
    "srno",
    "name",
    "id",
    "contact",
    "account_code",
    "email",
    "credit_limit",
    "current_due",
    "credit_days_remaining",
    "city",
    "state",
    "status",
  ],
  providers: [
    "validator_name",
    "provider_name",
    "provider_id",
    "contact_no",
    "email_id",
    "speciality",
    "account",
    "city",
    "state",
    "portal_enabled",
  ],
};

const authScreen = document.getElementById("auth-screen");
const authGateway = document.getElementById("auth-gateway");
const authLoginShell = document.getElementById("auth-login-shell");
const appShell = document.getElementById("app-shell");
const authLaunchBtn = document.getElementById("auth-launch-btn");
const authBackBtn = document.getElementById("auth-back-btn");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const authModeButtons = Array.from(document.querySelectorAll("[data-auth-mode]"));
const authModeHelper = document.getElementById("auth-mode-helper");
const doctorSsoWrap = document.getElementById("doctor-sso-wrap");
const doctorSsoBtn = document.getElementById("doctor-sso-btn");
const doctorEmailWrap = document.getElementById("doctor-email-wrap");
const clientUsernameWrap = document.getElementById("client-username-wrap");
const passwordWrap = document.getElementById("password-wrap");
const authActions = document.getElementById("auth-actions");
const logoutBtn = document.getElementById("logout-btn");
const sessionMenuTrigger = document.getElementById("session-menu-trigger");
const sessionMenu = document.getElementById("session-menu");
const sessionLoginType = document.getElementById("session-login-type");
const sessionDisplayName = document.getElementById("session-display-name");
const sessionLoginDetail = document.getElementById("session-login-detail");
const sessionPlanName = document.getElementById("session-plan-name");
const nav = document.getElementById("side-nav");
const panelTitle = document.getElementById("panel-title");
const panelSubtitle = document.getElementById("panel-subtitle");
const panelBody = document.getElementById("panel-body");
const panelHeader = document.getElementById("panel-header");

let csrfToken = "";
let pendingAuth = false;
let authStage = "gateway";
let authMode = "doctor";
const defaultAppTimeZone = "UTC";
const shortMonthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
let authConfig = {
  adminAuthMode: "local",
  oidcLoginUrl: "/auth/oidc/login",
  timeZone: defaultAppTimeZone,
};
let authConfigPromise = null;
let appTimeZone = defaultAppTimeZone;
const appDateFormatterCache = new Map();
let sessionMenuOpen = false;
let activeSession = createDefaultActiveSession();
let currentView = "dashboard";
let requisitionSubtab = "create";
let facilityTab = "accounts";
let formulaBookState = {
  section: "report-formulas",
  reportType: "",
};
let facilityAccountsQuery = "";
let facilityAccountsDisabledOnly = false;
let facilityProvidersQuery = "";
let facilityAccountFilters = {
  name: "",
  contact: "",
  accountCode: "",
  city: "",
  email: "",
};
let facilityProviderFilters = {
  name: "",
  contact: "",
  specialty: "",
  state: "",
  email: "",
};
let facilitySearchExpanded = {
  accounts: false,
  providers: false,
};
let facilityModalSection = "basic";
let facilityProviderModalSection = "provider-info";
let currentSearchInput = null;
let facilityDataLoaded = false;
let facilityDataLoading = false;
let facilityDataPromise = null;
let facilityData = {
  accounts: [],
  providers: [],
};
const adminTimeZoneSuggestions = [
  "America/Vancouver",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
];
let adminSettingsState = {
  timeZone: defaultAppTimeZone,
};
let adminSettingsReady = false;
let adminSettingsPromise = null;
let auditLogState = {
  entries: [],
  loading: false,
  error: "",
  authorized: false,
  checkingAccess: false,
  pinSubmitting: false,
  pinFailed: false,
};
const registrationsStorageKey = "labcenter.registrations";
const ordersStorageKey = "labcenter.orders";
const uploadResultsLogStorageKey = "labcenter.upload-results-log.v1";
const portalDataMigrationStorageKey = "labcenter.server-data-migrated.v1";
const panelCatalogStorageKey = "labcenter.panel-catalog.v1";
const masterRegistryStorageKey = "labcenter.master-registry.v1";
const orderIdPadLength = 5;
const orderIdStartNumber = 1;
const {
  buildIcdCatalogIndex,
  compareIcdCodes,
  formatIcdCode,
  formatIcdCodeList,
  isLikelyIcdCode,
  matchesIcdSearch,
  normalizeIcdCode,
  normalizeIcdCodeList,
  sanitizeIcdCatalogRecord,
} = globalThis.LabCenterIcdCodeUtils || {};

if (
  typeof buildIcdCatalogIndex !== "function"
  || typeof formatIcdCode !== "function"
  || typeof normalizeIcdCode !== "function"
  || typeof sanitizeIcdCatalogRecord !== "function"
) {
  throw new Error("LabCenter ICD utilities failed to load.");
}

let registrationsState = [];
let ordersState = [];
let uploadResultsLogState = [];
let portalDataReady = false;
let portalDataPromise = null;
const defaultSessionTimeoutMs = 15 * 60 * 1000;
const defaultSessionWarningMs = 2 * 60 * 1000;
let sessionTimeoutMs = defaultSessionTimeoutMs;
let sessionWarningMs = defaultSessionWarningMs;
let sessionExpiresAtMs = 0;
let sessionMonitorTimerId = 0;
let sessionEditingActive = false;
let sessionWarningModalVisible = false;
let sessionRefreshInFlight = false;
let sessionLogoutInFlight = false;

function resolveAppTimeZone(value = defaultAppTimeZone) {
  const timeZone = String(value || "").trim() || defaultAppTimeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return defaultAppTimeZone;
  }
}

function buildDateFormatterCacheKey(timeZone, options = {}) {
  return JSON.stringify(
    Object.entries({
      timeZone: resolveAppTimeZone(timeZone),
      ...options,
    }).sort(([left], [right]) => left.localeCompare(right))
  );
}

function getDateFormatterForTimeZone(timeZone, options = {}) {
  const cacheKey = buildDateFormatterCacheKey(timeZone, options);
  if (!appDateFormatterCache.has(cacheKey)) {
    appDateFormatterCache.set(
      cacheKey,
      new Intl.DateTimeFormat("en-US", {
        timeZone: resolveAppTimeZone(timeZone),
        ...options,
      })
    );
  }
  return appDateFormatterCache.get(cacheKey);
}

function setAppTimeZone(value) {
  appTimeZone = resolveAppTimeZone(value);
  return appTimeZone;
}

function getAppTimeZone() {
  return appTimeZone;
}

function getAppDateFormatter(options = {}) {
  return getDateFormatterForTimeZone(getAppTimeZone(), options);
}

function extractDateOnlyParts(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: match[1],
    month: match[2],
    day: match[3],
  };
}

function parseDateValue(value) {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveDatePartsInAppTimeZone(value) {
  const dateOnlyParts = extractDateOnlyParts(value);
  if (dateOnlyParts) return dateOnlyParts;
  const parsed = parseDateValue(value);
  if (!parsed) return null;
  const parts = getAppDateFormatter({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  return {
    year: parts.find((part) => part.type === "year")?.value || "1970",
    month: parts.find((part) => part.type === "month")?.value || "01",
    day: parts.find((part) => part.type === "day")?.value || "01",
  };
}

function resolveDateTimePartsInAppTimeZone(value) {
  const dateOnlyParts = extractDateOnlyParts(value);
  if (dateOnlyParts) {
    return {
      ...dateOnlyParts,
      hour: "00",
      minute: "00",
      second: "00",
    };
  }
  const parsed = parseDateValue(value);
  if (!parsed) return null;
  const parts = getAppDateFormatter({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(parsed);
  return {
    year: parts.find((part) => part.type === "year")?.value || "1970",
    month: parts.find((part) => part.type === "month")?.value || "01",
    day: parts.find((part) => part.type === "day")?.value || "01",
    hour: parts.find((part) => part.type === "hour")?.value || "00",
    minute: parts.find((part) => part.type === "minute")?.value || "00",
    second: parts.find((part) => part.type === "second")?.value || "00",
  };
}

function formatDateParts(parts, options = {}) {
  if (!parts) return "";
  const monthStyle = options.month || "";
  const dayStyle = options.day || "";
  const yearStyle = options.year || "";
  const monthNumber = Math.max(1, Math.min(12, Number(parts.month) || 1));
  const dayNumber = Math.max(1, Math.min(31, Number(parts.day) || 1));
  const monthValue = monthStyle === "short"
    ? shortMonthNames[monthNumber - 1]
    : monthStyle === "2-digit"
    ? String(monthNumber).padStart(2, "0")
    : monthStyle
    ? String(monthNumber)
    : "";
  const dayValue = dayStyle === "2-digit"
    ? String(dayNumber).padStart(2, "0")
    : dayStyle
    ? String(dayNumber)
    : "";
  const yearValue = yearStyle === "2-digit"
    ? String(parts.year || "").slice(-2)
    : yearStyle
    ? String(parts.year || "")
    : "";

  if (monthStyle && dayStyle && yearStyle) {
    return monthStyle === "short"
      ? `${monthValue} ${dayValue}, ${yearValue}`
      : `${monthValue}/${dayValue}/${yearValue}`;
  }

  if (monthStyle && yearStyle && !dayStyle) {
    return monthStyle === "short"
      ? `${monthValue} ${yearValue}`
      : `${monthValue}/${yearValue}`;
  }

  if (monthStyle && dayStyle && !yearStyle) {
    return monthStyle === "short"
      ? `${monthValue} ${dayValue}`
      : `${monthValue}/${dayValue}`;
  }

  if (monthStyle && !dayStyle && !yearStyle) return monthValue;
  if (yearStyle && !monthStyle && !dayStyle) return yearValue;

  return [monthValue, dayValue, yearValue].filter(Boolean).join(" ").trim();
}

function formatAppDate(value, options = {}, fallback = "-") {
  const formatterOptions = {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    ...options,
  };
  const dateOnlyParts = extractDateOnlyParts(value);
  if (dateOnlyParts) {
    return formatDateParts(dateOnlyParts, formatterOptions) || fallback;
  }
  const parsed = parseDateValue(value);
  if (!parsed) return fallback;
  return getAppDateFormatter(formatterOptions).format(parsed);
}

function formatAppTime(value, options = {}, fallback = "") {
  if (!value) return fallback;
  if (/^\d{2}:\d{2}$/.test(String(value))) {
    const [hourRaw, minute] = String(value).split(":");
    const hour = Number(hourRaw);
    const period = hour >= 12 ? "PM" : "AM";
    const hour12 = ((hour + 11) % 12) + 1;
    return `${hour12}:${minute} ${period}`;
  }
  if (extractDateOnlyParts(value)) return fallback || String(value);
  const parsed = parseDateValue(value);
  if (!parsed) return String(value);
  return getAppDateFormatter({
    hour: "numeric",
    minute: "2-digit",
    ...options,
  }).format(parsed);
}

function formatAppDateTime(value, options = {}, fallback = "-") {
  if (!value) return fallback;
  const formatterOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  };
  const dateOnlyParts = extractDateOnlyParts(value);
  if (dateOnlyParts) {
    const { hour, minute, second, hour12, ...dateOnlyOptions } = formatterOptions;
    return formatDateParts(dateOnlyParts, dateOnlyOptions) || fallback;
  }
  const parsed = parseDateValue(value);
  if (!parsed) return fallback;
  return getAppDateFormatter(formatterOptions).format(parsed);
}

function formatDateTimeForTimeZone(value, timeZone, options = {}, fallback = "-") {
  if (!value) return fallback;
  const formatterOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  };
  const dateOnlyParts = extractDateOnlyParts(value);
  if (dateOnlyParts) {
    const { hour, minute, second, hour12, ...dateOnlyOptions } = formatterOptions;
    return formatDateParts(dateOnlyParts, dateOnlyOptions) || fallback;
  }
  const parsed = parseDateValue(value);
  if (!parsed) return fallback;
  return getDateFormatterForTimeZone(timeZone, formatterOptions).format(parsed);
}

function normalizeUtcOffsetLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "UTC+00:00";
  if (/^(?:GMT|UTC)$/i.test(raw)) return "UTC+00:00";
  const match = raw.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) {
    return raw.replace(/^GMT/i, "UTC");
  }
  const [, sign, hourValue, minuteValue = "00"] = match;
  return `UTC${sign}${String(hourValue).padStart(2, "0")}:${String(minuteValue).padStart(2, "0")}`;
}

function getTimeZoneOffsetLabel(timeZone, referenceValue = new Date().toISOString()) {
  const parsed = parseDateValue(referenceValue);
  if (!parsed) return "UTC+00:00";
  const parts = getDateFormatterForTimeZone(timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "longOffset",
  }).formatToParts(parsed);
  return normalizeUtcOffsetLabel(parts.find((part) => part.type === "timeZoneName")?.value || "UTC");
}

function getAppDateKey(value) {
  const parts = resolveDatePartsInAppTimeZone(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
}

function buildAdminTimeZoneCatalog() {
  const recommended = [];
  const seen = new Set();

  adminTimeZoneSuggestions.forEach((value) => {
    const resolved = resolveAppTimeZone(value);
    if (!seen.has(resolved)) {
      recommended.push(resolved);
      seen.add(resolved);
    }
  });

  const supportedValues = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [];
  const allValues = Array.from(new Set([
    "UTC",
    ...recommended,
    ...supportedValues.map((value) => resolveAppTimeZone(value)),
  ]));
  const remaining = allValues
    .filter((value) => !recommended.includes(value))
    .sort((left, right) => left.localeCompare(right));

  return {
    recommended,
    remaining,
  };
}

const adminTimeZoneCatalog = buildAdminTimeZoneCatalog();

function formatAdminTimeZoneLabel(value, referenceValue = new Date().toISOString()) {
  const resolved = resolveAppTimeZone(value);
  return `${resolved} (${getTimeZoneOffsetLabel(resolved, referenceValue)})`;
}

function buildAdminTimeZoneOptionsMarkup(selectedValue = defaultAppTimeZone, referenceValue = new Date().toISOString()) {
  const resolvedSelection = resolveAppTimeZone(selectedValue);
  const recommended = adminTimeZoneCatalog.recommended.includes(resolvedSelection)
    ? adminTimeZoneCatalog.recommended
    : [resolvedSelection, ...adminTimeZoneCatalog.recommended];
  const remaining = adminTimeZoneCatalog.remaining.filter((value) => value !== resolvedSelection);

  return [
    `<optgroup label="Recommended">${recommended
      .map((value) => `<option value="${escapeHtml(value)}"${value === resolvedSelection ? " selected" : ""}>${escapeHtml(formatAdminTimeZoneLabel(value, referenceValue))}</option>`)
      .join("")}</optgroup>`,
    remaining.length
      ? `<optgroup label="All Time Zones">${remaining
        .map((value) => `<option value="${escapeHtml(value)}"${value === resolvedSelection ? " selected" : ""}>${escapeHtml(formatAdminTimeZoneLabel(value, referenceValue))}</option>`)
        .join("")}</optgroup>`
      : "",
  ].join("");
}

function formatAppAccessionDate(value) {
  const parts = resolveDatePartsInAppTimeZone(value);
  if (!parts) return "";
  return `${parts.month}${parts.day}${String(parts.year || "").slice(-2)}`;
}

function formatAppMonthLabel(year, month, options = {}) {
  return formatDateParts(
    {
      year: String(year || "").padStart(4, "0"),
      month: String(month || "").padStart(2, "0"),
      day: "01",
    },
    {
      month: "short",
      ...(options.includeYear ? { year: "numeric" } : {}),
    }
  );
}

function shiftYearMonth(year, month, offset) {
  const zeroBasedMonth = Math.max(0, (Number(month) || 1) - 1);
  const totalMonths = (Number(year) || 0) * 12 + zeroBasedMonth + Number(offset || 0);
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12 + 12) % 12;
  return {
    year: nextYear,
    month: nextMonth + 1,
  };
}

setAppTimeZone(authConfig.timeZone);

function createDefaultActiveSession() {
  return {
    type: "doctor",
    accessType: "full",
    accountId: "",
    accountName: "",
    username: "",
    displayName: "",
    email: "",
    entityType: "doctor",
  };
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getSessionPlanLabel() {
  if (activeSession.type === "doctor") return "Full Access";

  switch (activeSession.accessType) {
    case "report_view_order":
      return "Starter Plan + Orders";
    case "report_view":
      return "Starter Plan";
    case "no_login":
      return "Restricted Access";
    default:
      return "Portal Access";
  }
}

function getSessionSummary() {
  if (activeSession.type === "doctor") {
    return {
      loginType: "Admin Login",
      displayName: activeSession.displayName || activeSession.accountName || "LabCenter Admin",
      detail: activeSession.email || activeSession.username || "Admin workspace",
      plan: getSessionPlanLabel(),
    };
  }

  const detailParts = [];
  if (activeSession.accountId) detailParts.push(`#${activeSession.accountId}`);
  if (activeSession.username) detailParts.push(activeSession.username);

  return {
    loginType: activeSession.entityType === "provider" ? "Provider Portal" : "Client Portal",
    displayName: activeSession.accountName || activeSession.displayName || activeSession.username || "LabCenter User",
    detail: detailParts.join(" • ") || "Portal workspace",
    plan: getSessionPlanLabel(),
  };
}

function getPrimaryAuthInput() {
  if (authMode === "doctor" && getAdminAuthMode() === "oidc") {
    return doctorSsoBtn;
  }

  return authMode === "client"
    ? document.getElementById("client-username")
    : document.getElementById("doctor-email");
}

function setAuthStage(nextStage) {
  authStage = nextStage === "login" ? "login" : "gateway";
  authGateway?.classList.toggle("hidden", authStage !== "gateway");
  authLoginShell?.classList.toggle("hidden", authStage !== "login");

  if (authStage === "login") {
    window.requestAnimationFrame(() => {
      getPrimaryAuthInput()?.focus();
    });
  } else {
    window.requestAnimationFrame(() => {
      authLaunchBtn?.focus();
    });
  }
}

function setSessionMenuOpen(isOpen) {
  sessionMenuOpen = Boolean(isOpen);
  sessionMenu?.classList.toggle("hidden", !sessionMenuOpen);
  sessionMenuTrigger?.setAttribute("aria-expanded", String(sessionMenuOpen));
}

function renderSessionSummary() {
  const summary = getSessionSummary();
  if (sessionLoginType) sessionLoginType.textContent = summary.loginType;
  if (sessionDisplayName) sessionDisplayName.textContent = summary.displayName;
  if (sessionLoginDetail) sessionLoginDetail.textContent = summary.detail;
  if (sessionPlanName) sessionPlanName.textContent = summary.plan;
}

function formatSessionCountdown(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil(Math.max(0, remainingMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function syncBodyModalOpenState() {
  const hasVisibleModal = Boolean(
    document.querySelector(
      ".facility-modal-backdrop:not(.hidden), .custom-icd-modal:not(.hidden), .history-preview-modal:not(.hidden), .session-expiry-backdrop:not(.hidden), .output-results-publish-modal:not(.hidden)"
    )
  );
  document.body.classList.toggle("modal-open", hasVisibleModal);
}

function getSessionExpiryModalRefs() {
  let root = document.getElementById("session-expiry-modal");
  if (!root) {
    root = document.createElement("div");
    root.id = "session-expiry-modal";
    root.className = "session-expiry-backdrop hidden";
    root.innerHTML = `
      <div class="session-expiry-dialog" role="dialog" aria-modal="true" aria-labelledby="session-expiry-title">
        <p class="badge">Session Warning</p>
        <h3 id="session-expiry-title">Your session is about to expire</h3>
        <p class="session-expiry-copy">Stay signed in to keep working without interruption, or log out now.</p>
        <div class="session-expiry-countdown" aria-live="polite">
          <strong id="session-expiry-timer">2:00</strong>
          <span>remaining</span>
        </div>
        <p id="session-expiry-status" class="subtle session-expiry-status">We’ll refresh your secure session in the background.</p>
        <div class="session-expiry-actions">
          <button type="button" id="session-expiry-logout" class="btn-ghost">Log out</button>
          <button type="button" id="session-expiry-stay" class="btn-primary">Stay logged in</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    root.addEventListener("click", (event) => {
      if (event.target === root) {
        event.preventDefault();
      }
    });

    root.querySelector("#session-expiry-stay")?.addEventListener("click", () => {
      refreshAuthenticatedSession().catch(() => {});
    });
    root.querySelector("#session-expiry-logout")?.addEventListener("click", () => {
      performLogoutFlow().catch(() => {});
    });
  }

  return {
    root,
    timer: root.querySelector("#session-expiry-timer"),
    status: root.querySelector("#session-expiry-status"),
    stayButton: root.querySelector("#session-expiry-stay"),
    logoutButton: root.querySelector("#session-expiry-logout"),
  };
}

function updateSessionExpiryModal(remainingMs, statusText = "") {
  const refs = getSessionExpiryModalRefs();
  if (refs.timer) refs.timer.textContent = formatSessionCountdown(remainingMs);
  if (refs.status) {
    refs.status.textContent = statusText || "We’ll refresh your secure session in the background.";
  }
  if (refs.stayButton) refs.stayButton.disabled = sessionRefreshInFlight || sessionLogoutInFlight;
  if (refs.logoutButton) refs.logoutButton.disabled = sessionRefreshInFlight || sessionLogoutInFlight;
}

function openSessionExpiryModal() {
  const refs = getSessionExpiryModalRefs();
  refs.root.classList.remove("hidden");
  sessionWarningModalVisible = true;
  updateSessionExpiryModal(sessionExpiresAtMs - Date.now());
  syncBodyModalOpenState();
}

function closeSessionExpiryModal() {
  const refs = document.getElementById("session-expiry-modal");
  if (!refs) return;
  refs.classList.add("hidden");
  sessionWarningModalVisible = false;
  syncBodyModalOpenState();
}

function applySessionState(sessionState) {
  if (!sessionState || typeof sessionState !== "object") return;

  sessionTimeoutMs = Math.max(30 * 1000, Math.floor(Number(sessionState.timeoutMs || defaultSessionTimeoutMs) || defaultSessionTimeoutMs));
  sessionWarningMs = Math.max(
    15 * 1000,
    Math.min(
      sessionTimeoutMs - 5 * 1000,
      Math.floor(Number(sessionState.warningMs || defaultSessionWarningMs) || defaultSessionWarningMs)
    )
  );

  const expiresAtMs = new Date(sessionState.expiresAt || "").getTime();
  if (Number.isFinite(expiresAtMs)) {
    sessionExpiresAtMs = expiresAtMs;
  } else {
    const remainingMs = Math.max(0, Math.floor(Number(sessionState.remainingMs || sessionTimeoutMs) || sessionTimeoutMs));
    sessionExpiresAtMs = Date.now() + remainingMs;
  }

  if (sessionMonitorTimerId) {
    handleSessionMonitorTick();
  }
}

function startSessionMonitor() {
  if (!sessionExpiresAtMs) return;
  window.clearInterval(sessionMonitorTimerId);
  sessionMonitorTimerId = window.setInterval(handleSessionMonitorTick, 1000);
  handleSessionMonitorTick();
}

function stopSessionMonitor({ resetEditing = true } = {}) {
  window.clearInterval(sessionMonitorTimerId);
  sessionMonitorTimerId = 0;
  sessionExpiresAtMs = 0;
  sessionRefreshInFlight = false;
  sessionLogoutInFlight = false;
  closeSessionExpiryModal();
  if (resetEditing) {
    sessionEditingActive = false;
  }
}

function markSessionEditingActivity() {
  if (appShell.classList.contains("hidden")) return;
  sessionEditingActive = true;
  handleSessionMonitorTick();
}

function handleSessionMonitorTick() {
  if (!sessionExpiresAtMs || appShell.classList.contains("hidden")) return;

  const remainingMs = sessionExpiresAtMs - Date.now();
  if (remainingMs <= 0) {
    if (!sessionLogoutInFlight) {
      closeSessionExpiryModal();
      performLogoutFlow({ postMessage: "Your session expired. Sign in again to continue." }).catch(() => {});
    }
    return;
  }

  const shouldWarn = sessionEditingActive && remainingMs <= sessionWarningMs;
  if (shouldWarn && !sessionWarningModalVisible) {
    openSessionExpiryModal();
  } else if (!shouldWarn && sessionWarningModalVisible && !sessionRefreshInFlight) {
    closeSessionExpiryModal();
  }

  if (sessionWarningModalVisible) {
    updateSessionExpiryModal(remainingMs, sessionRefreshInFlight ? "Refreshing your secure session..." : "");
  }
}

async function refreshAuthenticatedSession() {
  if (sessionRefreshInFlight || sessionLogoutInFlight) return;
  sessionRefreshInFlight = true;
  updateSessionExpiryModal(sessionExpiresAtMs - Date.now(), "Refreshing your secure session...");

  const attemptRefresh = async () => requestJson("/api/session/refresh", {
    method: "POST",
    headers: {
      "x-csrf-token": csrfToken,
    },
  });

  try {
    if (!csrfToken) await fetchCsrfToken();
    let result;
    try {
      result = await attemptRefresh();
    } catch (error) {
      if ((error?.message || "").trim() !== "Invalid CSRF token.") {
        throw error;
      }
      await fetchCsrfToken();
      result = await attemptRefresh();
    }

    csrfToken = result?.csrfToken || csrfToken;
    applySessionState(result?.session);
    closeSessionExpiryModal();
  } catch {
    await performLogoutFlow({ postMessage: "Unable to keep your session active. Sign in again to continue." });
  } finally {
    sessionRefreshInFlight = false;
    if (sessionWarningModalVisible) {
      updateSessionExpiryModal(sessionExpiresAtMs - Date.now());
    }
  }
}

const patientDirectory = [
  {
    patientId: "9001",
    firstName: "Test",
    middleName: "Alpha",
    lastName: "Patient",
    sex: "Female",
    dob: "1992-03-14",
    phone: "5550109001",
    mrn: "TST-MRN-9001",
    provider: "Test Provider One",
    facilityName: "Test Facility A",
    city: "Austin",
    state: "TX",
    country: "United States of America",
  },
  {
    patientId: "9002",
    firstName: "Test",
    middleName: "",
    lastName: "Bravo",
    sex: "Male",
    dob: "1985-07-22",
    phone: "5550109002",
    mrn: "TST-MRN-9002",
    provider: "Test Provider Two",
    facilityName: "Test Facility B",
    city: "Denver",
    state: "CO",
    country: "United States of America",
  },
  {
    patientId: "9003",
    firstName: "Sample",
    middleName: "Charlie",
    lastName: "Record",
    sex: "Female",
    dob: "1979-11-05",
    phone: "5550109003",
    mrn: "TST-MRN-9003",
    provider: "Test Provider Three",
    facilityName: "Test Facility C",
    city: "Phoenix",
    state: "AZ",
    country: "United States of America",
  },
  {
    patientId: "9004",
    firstName: "Demo",
    middleName: "",
    lastName: "User",
    sex: "Other",
    dob: "2001-01-09",
    phone: "5550109004",
    mrn: "TST-MRN-9004",
    provider: "Test Provider Four",
    facilityName: "Test Facility D",
    city: "Seattle",
    state: "WA",
    country: "United States of America",
  },
  {
    patientId: "9005",
    firstName: "QA",
    middleName: "",
    lastName: "Scenario",
    sex: "Male",
    dob: "1996-09-30",
    phone: "5550109005",
    mrn: "TST-MRN-9005",
    provider: "Test Provider Five",
    facilityName: "Test Facility E",
    city: "Boston",
    state: "MA",
    country: "United States of America",
  },
];
const defaultIcdCatalogSeed = [
  { code: "U07.1", description: "Virus Identified" },
  { code: "U07.2", description: "Virus Not Identified" },
  { code: "Z20.828", description: "COVID-19 Virus QUALITATIVE PCR" },
  { code: "Z01.812", description: "Encounter for procedural laboratory examination" },
  { code: "Z11.52", description: "Encounter for screening for COVID" },
  { code: "Z86.12", description: "Personal History of COVID" },
  { code: "Z20.822", description: "Contact with and suspected exposure to COVID" },
  { code: "Z11.59", description: "Encounter for screening for other viral diseases" },
  { code: "Z03.818", description: "Encounter for observation for suspected exposure to other biological agents ruled out" },
  { code: "R50.9", description: "Cough" },
  { code: "B94.8", description: "Sequelae of other specified infectious and parasitic diseases" },
  { code: "D50.9", description: "Iron deficiency anemia, unspecified" },
  { code: "D51.9", description: "Vitamin B12 deficiency anemia, unspecified" },
  { code: "D64.9", description: "Anemia, unspecified" },
  { code: "E03.9", description: "Hypothyroidism, unspecified" },
  { code: "E10.9", description: "Type 1 diabetes mellitus without complications" },
  { code: "E11.9", description: "Type 2 diabetes mellitus without complications" },
  { code: "E28.2", description: "Polycystic ovarian syndrome" },
  { code: "E29.1", description: "Testicular hypofunction" },
  { code: "E34.9", description: "Endocrine disorder, unspecified" },
];

const icdDatasetRecords = Array.isArray(globalThis.LabCenterIcdCodeData?.records)
  && globalThis.LabCenterIcdCodeData.records.length
  ? globalThis.LabCenterIcdCodeData.records
  : defaultIcdCatalogSeed;
const baseIcdCatalog = buildIcdCatalogIndex(icdDatasetRecords).entries.map((entry) => ({
  code: entry.code,
  description: entry.description,
}));
const baseIcdCatalogLookup = new Map(baseIcdCatalog.map((entry) => [entry.code, entry]));
const customIcdCatalog = [];
const icdCatalog = [];
let icdCatalogLookup = new Map();
let icdCatalogSearchRows = [];

function rebuildIcdCatalogState() {
  const merged = new Map(baseIcdCatalog.map((entry) => [entry.code, {
    code: entry.code,
    description: entry.description,
  }]));

  customIcdCatalog.forEach((entry) => {
    merged.set(entry.code, {
      code: entry.code,
      description: entry.description,
    });
  });

  const nextIndex = buildIcdCatalogIndex(Array.from(merged.values()));
  icdCatalog.splice(0, icdCatalog.length, ...nextIndex.entries.map((entry) => ({
    code: entry.code,
    description: entry.description,
  })));
  icdCatalogLookup = new Map(nextIndex.entries.map((entry) => [entry.code, entry]));
  icdCatalogSearchRows = nextIndex.entries;
}

function getIcdCatalogRecord(code) {
  return icdCatalogLookup.get(normalizeIcdCode(code)) || null;
}

function getIcdDisplayCode(code) {
  const record = getIcdCatalogRecord(code);
  return record?.formattedCode || formatIcdCode(code);
}

function formatIcdCodesForDisplay(values) {
  return formatIcdCodeList(values).join(", ");
}

function buildIcdSearchValues(values) {
  return normalizeIcdCodeList(values)
    .map((code) => {
      const record = getIcdCatalogRecord(code);
      if (!record) return `${code} ${formatIcdCode(code)}`.trim();
      return [record.code, record.formattedCode || formatIcdCode(record.code), record.description]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(" ");
    })
    .join(" ");
}

function addIcdCodeToAllPanels(code, options = {}) {
  const persist = Boolean(options.persist);
  const canonical = normalizeIcdCode(code);
  if (!canonical || !icdCatalogLookup.has(canonical)) return false;

  let changed = false;
  orderPanelCatalog.forEach((panel) => {
    const nextCodes = normalizeIcdCodeList(Array.isArray(panel?.icdCodes) ? panel.icdCodes : []);
    if (nextCodes.includes(canonical)) return;
    nextCodes.push(canonical);
    nextCodes.sort(compareIcdCodes);
    panel.icdCodes = nextCodes;
    changed = true;
  });

  if (changed && persist) savePanelCatalogState();
  return changed;
}

const orderPanelCatalog = [
  { id: "attachment", name: "Attachment", alias: "Attachment", price: 0, icdCodes: ["Z01812", "Z1159", "Z03818"] },
  { id: "gastrointestinal-panel", name: "Gastrointestinal Panel", alias: "Gastrointestinal Panel", price: 0, icdCodes: ["D509", "D519", "D649"] },
  { id: "nail-panel", name: "Nail Panel", alias: "Nail Panel", price: 0, icdCodes: ["B948", "D649"] },
  { id: "basic-flu-panel", name: "BASIC FLU PANEL", alias: "BASIC FLU PANEL", price: 0, icdCodes: ["U071", "U072", "Z1152", "R509"] },
  { id: "final-report", name: "Final Report", alias: "ChoicePharmD", price: 1, icdCodes: ["Z01812"] },
  { id: "upload-pdf", name: "Upload PDF", alias: "Upload PDF", price: 0, icdCodes: ["Z01812"] },
  { id: "eye-panel", name: "Eye Panel", alias: "Eye Panel", price: 0, icdCodes: ["E039", "E119"] },
  { id: "molecular-test", name: "Molecular Test", alias: "Molecular Test", price: 0, icdCodes: ["U071", "U072", "Z20828", "Z1152", "Z20822"] },
  { id: "wound-panel", name: "Wound Panel", alias: "Wound Panel", price: 0, icdCodes: ["B948", "Z20822", "Z03818"] },
  { id: "respiratory-pathogens-panel", name: "Respiratory Pathogens Panel", alias: "Respiratory Pathogens Panel", price: 0, icdCodes: ["U071", "U072", "Z1159", "R509"] },
  { id: "sti-panel", name: "Sexually Transmitted Infection Panel", alias: "Sexually Transmitted Infection Panel", price: 0, icdCodes: ["Z01812", "Z03818", "E291"] },
  { id: "uti-pcr-panel", name: "Urinary Tract Infection PCR Panel", alias: "Urinary Tract Infection PCR Panel", price: 0, icdCodes: ["Z01812", "Z1159", "Z03818"] },
  { id: "womens-health-panel", name: "Women's Health Panel", alias: "Women's Health Panel", price: 0, icdCodes: ["E282", "E039", "E119", "E349"] },
];
const panelAccessionPrefixById = {
  attachment: "AT",
  "gastrointestinal-panel": "GS",
  "nail-panel": "NL",
  "basic-flu-panel": "BF",
  "final-report": "FR",
  "upload-pdf": "UP",
  "eye-panel": "EY",
  "molecular-test": "MT",
  "wound-panel": "WN",
  "respiratory-pathogens-panel": "RP",
  "sti-panel": "ST",
  "uti-pcr-panel": "UT",
  "womens-health-panel": "WH",
};

function normalizePanelIdValue(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makePanelIdFromName(name) {
  return normalizePanelIdValue(String(name || "").replace(/\s+/g, "-"));
}

function makeUniquePanelId(baseId, usedIds = new Set()) {
  const root = normalizePanelIdValue(baseId) || "panel";
  if (!usedIds.has(root)) return root;
  let suffix = 2;
  let candidate = `${root}-${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
  return candidate;
}

function snapshotPanelCatalogState() {
  return {
    panels: orderPanelCatalog.map((panel) => ({
      id: String(panel.id || "").trim(),
      name: String(panel.name || "").trim(),
      alias: String(panel.alias || "").trim(),
      price: Number(panel.price || 0),
      icdCodes: normalizeIcdCodeList(Array.isArray(panel.icdCodes) ? panel.icdCodes : []),
    })),
    prefixes: { ...panelAccessionPrefixById },
  };
}

function savePanelCatalogState() {
  try {
    localStorage.setItem(panelCatalogStorageKey, JSON.stringify(snapshotPanelCatalogState()));
  } catch {
    // Ignore storage failures and continue with in-memory state.
  }
}

function loadPanelCatalogState() {
  try {
    const raw = localStorage.getItem(panelCatalogStorageKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.panels)) return false;

    const seenIds = new Set();
    const nextPanels = [];
    parsed.panels.forEach((panel) => {
      const name = String(panel?.name || "").trim();
      if (!name) return;
      const alias = String(panel?.alias || name).trim() || name;
      const rawId = String(panel?.id || makePanelIdFromName(name)).trim();
      const panelId = makeUniquePanelId(rawId, seenIds);
      seenIds.add(panelId);
      const price = Number.isFinite(Number(panel?.price)) ? Number(panel.price) : 0;
      const icdCodes = normalizeIcdCodeList(Array.isArray(panel?.icdCodes) ? panel.icdCodes : []);
      nextPanels.push({
        id: panelId,
        name,
        alias,
        price,
        icdCodes,
      });
    });

    if (!nextPanels.length) return false;

    orderPanelCatalog.splice(0, orderPanelCatalog.length, ...nextPanels);
    Object.keys(panelAccessionPrefixById).forEach((key) => delete panelAccessionPrefixById[key]);

    const prefixes = parsed?.prefixes && typeof parsed.prefixes === "object" ? parsed.prefixes : {};
    nextPanels.forEach((panel) => {
      const prefix = String(prefixes[panel.id] || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
      if (prefix) panelAccessionPrefixById[panel.id] = prefix;
    });
    return true;
  } catch {
    // Ignore malformed state and keep defaults.
    return false;
  }
}

rebuildIcdCatalogState();
loadPanelCatalogState();

function syncAllPanelsToCatalogIcdCodes(options = {}) {
  const persist = Boolean(options.persist);
  let changed = false;

  orderPanelCatalog.forEach((panel) => {
    const normalizedCodes = normalizeIcdCodeList(Array.isArray(panel?.icdCodes) ? panel.icdCodes : []);
    const nextCodes = normalizedCodes.filter((code) => icdCatalogLookup.has(code));
    const sameLength = normalizedCodes.length === nextCodes.length;
    const sameValues = sameLength && nextCodes.every((code, index) => normalizedCodes[index] === code);
    if (sameValues) return;
    panel.icdCodes = nextCodes;
    changed = true;
  });

  if (changed && persist) savePanelCatalogState();
  return changed;
}

syncAllPanelsToCatalogIcdCodes({ persist: true });

function normalizePanelKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getPanelIdByName(panelName) {
  const needle = normalizePanelKey(panelName);
  if (!needle) return "";
  const matched = orderPanelCatalog.find((panel) => {
    return normalizePanelKey(panel.id) === needle
      || normalizePanelKey(panel.name) === needle
      || normalizePanelKey(panel.alias) === needle;
  });
  return matched?.id || "";
}

function resolvePanelPrefixFromService(serviceLine) {
  if (Array.isArray(serviceLine?.panelIds) && serviceLine.panelIds.length) {
    const firstMapped = serviceLine.panelIds.find((panelId) => panelAccessionPrefixById[panelId]);
    if (firstMapped) return panelAccessionPrefixById[firstMapped];
  }

  const rawName = String(serviceLine?.serviceName || "").trim();
  if (rawName) {
    const firstName = rawName.split(",").map((item) => item.trim()).find(Boolean) || "";
    const panelId = getPanelIdByName(firstName);
    if (panelId && panelAccessionPrefixById[panelId]) return panelAccessionPrefixById[panelId];
  }

  return "GN";
}

function formatAccessionDate(orderDateValue) {
  return formatAppAccessionDate(orderDateValue || new Date().toISOString());
}

function buildAccessionNumber({ serviceLine, orderDate, orderId }) {
  const panelPrefix = resolvePanelPrefixFromService(serviceLine);
  const datePart = formatAccessionDate(orderDate);
  const orderPartRaw = String(orderId || "").trim();
  const orderPart = orderPartRaw.replace(/\D/g, "") || orderPartRaw || "00000";
  return `${panelPrefix}${datePart}${orderPart}`;
}

function getBarcodeLabelApi() {
  if (typeof window === "undefined") return null;
  return window.LabCenterBarcodeLabel || null;
}

function normalizeCode128Value(value) {
  const labelApi = getBarcodeLabelApi();
  if (labelApi?.normalizeCode128Value) return labelApi.normalizeCode128Value(value);
  const raw = String(value || "").trim();
  if (!raw) return "UNKNOWN";
  return Array.from(raw)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code <= 126 ? char : "-";
    })
    .join("");
}

function buildLabelPdfBlob({ barcodeValue, patientLine }) {
  const labelApi = getBarcodeLabelApi();
  if (!labelApi?.buildLabelPdfBlob) {
    throw new Error("Barcode label tools are unavailable.");
  }
  return labelApi.buildLabelPdfBlob({ barcodeValue, patientLine });
}

function openBarcodeLabelPrint(row) {
  if (!row) return;

  const barcodeValue = normalizeCode128Value(row.accession || row.orderId || row.raw?.patientId || "");
  const firstName = String(row.firstName || "").trim();
  const lastName = String(row.lastName || "").trim();
  const fullName = [lastName, firstName].filter(Boolean).join(" ");
  const dob = String(row.dob || "").trim() || "-";
  const gender = String(row.gender || "").trim();
  const genderCode = gender ? gender.charAt(0).toUpperCase() : "U";
  const patientLine = `${fullName || "Unknown Patient"} ${dob} (${genderCode})`;
  const pdfBlob = buildLabelPdfBlob({ barcodeValue, patientLine });
  const pdfUrl = URL.createObjectURL(pdfBlob);
  const popup = window.open(pdfUrl, "_blank");

  if (!popup) {
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = `${barcodeValue}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  setTimeout(() => URL.revokeObjectURL(pdfUrl), 120000);
}
const registryPanels = {
  uti: "Urinary Tract Infection Panel",
  sti: "Sexually Transmitted Infection Panel",
  eye: "Eye Infection Panel",
  respiratory: "Respiratory Pathogen Panel",
  wound: "Wound Infection Panel",
  womens: "Women's Health Panel",
  gi: "Gastrointestinal Infection Panel",
};
const masterRegistrySeed = [
  { scientific_name: "Acinetobacter baumannii", common_name: "", type: "bacteria", ncbi_tax_id: 470, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.wound] },
  { scientific_name: "Adenovirus 40/41", common_name: "Enteric adenovirus", type: "virus", ncbi_tax_id: null, synonyms: ["Human adenovirus F40/F41"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Astrovirus", common_name: "", type: "virus", ncbi_tax_id: null, synonyms: ["Human astrovirus"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Atopobium vaginae", common_name: "", type: "bacteria", ncbi_tax_id: null, synonyms: ["Fannyhessea vaginae"], status: "active", panels: [registryPanels.womens] },
  { scientific_name: "Bacteroides fragilis", common_name: "", type: "bacteria", ncbi_tax_id: 817, synonyms: [], status: "active", panels: [registryPanels.wound] },
  { scientific_name: "BVAB2", common_name: "Bacterial vaginosis-associated bacterium 2", type: "bacteria", ncbi_tax_id: null, synonyms: ["BVAB-2"], status: "active", panels: [registryPanels.womens] },
  { scientific_name: "Campylobacter coli", common_name: "", type: "bacteria", ncbi_tax_id: 195, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Campylobacter jejuni", common_name: "", type: "bacteria", ncbi_tax_id: 197, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Campylobacter spp", common_name: "", type: "bacteria", ncbi_tax_id: null, synonyms: ["Campylobacter species"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Candida albicans", common_name: "", type: "fungus", ncbi_tax_id: 5476, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.womens] },
  { scientific_name: "Candida auris", common_name: "", type: "fungus", ncbi_tax_id: 498019, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.womens] },
  { scientific_name: "Candida glabrata", common_name: "", type: "fungus", ncbi_tax_id: 5478, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.womens] },
  { scientific_name: "Candida krusei", common_name: "", type: "fungus", ncbi_tax_id: 4909, synonyms: ["Pichia kudriavzevii"], status: "active", panels: [registryPanels.uti, registryPanels.womens] },
  { scientific_name: "Candida lusitaniae", common_name: "", type: "fungus", ncbi_tax_id: 5481, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.womens] },
  { scientific_name: "Candida parapsilosis", common_name: "", type: "fungus", ncbi_tax_id: 5480, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.womens] },
  { scientific_name: "Candida tropicalis", common_name: "", type: "fungus", ncbi_tax_id: 5482, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.womens] },
  { scientific_name: "Chlamydia trachomatis", common_name: "", type: "bacteria", ncbi_tax_id: 813, synonyms: [], status: "active", panels: [registryPanels.sti, registryPanels.eye, registryPanels.womens] },
  { scientific_name: "Citrobacter freundii", common_name: "", type: "bacteria", ncbi_tax_id: 546, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.wound] },
  { scientific_name: "Clostridioides difficile", common_name: "C. diff", type: "bacteria", ncbi_tax_id: 1496, synonyms: ["Clostridium difficile"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Clostridium novyi", common_name: "", type: "bacteria", ncbi_tax_id: null, synonyms: [], status: "active", panels: [registryPanels.wound, registryPanels.gi] },
  { scientific_name: "Clostridium perfringens", common_name: "", type: "bacteria", ncbi_tax_id: 1502, synonyms: [], status: "active", panels: [registryPanels.wound, registryPanels.gi] },
  { scientific_name: "Clostridium septicum", common_name: "", type: "bacteria", ncbi_tax_id: null, synonyms: [], status: "active", panels: [registryPanels.wound, registryPanels.gi] },
  { scientific_name: "Cryptosporidium hominis", common_name: "", type: "parasite", ncbi_tax_id: 237895, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Cyclospora cayetanensis", common_name: "", type: "parasite", ncbi_tax_id: 2903, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Dientamoeba fragilis", common_name: "", type: "parasite", ncbi_tax_id: 9988, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Enterobacter cloacae", common_name: "", type: "bacteria", ncbi_tax_id: 550, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.wound] },
  { scientific_name: "Enterococcus faecalis", common_name: "", type: "bacteria", ncbi_tax_id: 1351, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.wound, registryPanels.womens] },
  { scientific_name: "Enterococcus faecium", common_name: "", type: "bacteria", ncbi_tax_id: 1352, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.wound] },
  { scientific_name: "Entero PAN", common_name: "Enteric panel target", type: "bacteria", ncbi_tax_id: null, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Enteroaggregative Escherichia coli", common_name: "EAEC", type: "bacteria", ncbi_tax_id: null, synonyms: ["Enteroaggregative E. coli"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Enteroinvasive Escherichia coli", common_name: "EIEC", type: "bacteria", ncbi_tax_id: null, synonyms: ["Enteroinvasive E. coli"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Enteropathogenic Escherichia coli", common_name: "EPEC", type: "bacteria", ncbi_tax_id: null, synonyms: ["Enteropathogenic E. coli"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Enterotoxigenic Escherichia coli", common_name: "ETEC", type: "bacteria", ncbi_tax_id: null, synonyms: ["Enterotoxigenic E. coli"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Entamoeba histolytica", common_name: "", type: "parasite", ncbi_tax_id: 5759, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Escherichia coli", common_name: "E. coli", type: "bacteria", ncbi_tax_id: 562, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.wound, registryPanels.womens] },
  { scientific_name: "Escherichia coli O157", common_name: "E. coli O157", type: "bacteria", ncbi_tax_id: 83334, synonyms: ["E. coli O157:H7"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Gardnerella vaginalis", common_name: "", type: "bacteria", ncbi_tax_id: 2702, synonyms: [], status: "active", panels: [registryPanels.womens] },
  { scientific_name: "Giardia lamblia", common_name: "", type: "parasite", ncbi_tax_id: 5741, synonyms: ["Giardia intestinalis"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Haemophilus ducreyi", common_name: "", type: "bacteria", ncbi_tax_id: 730, synonyms: [], status: "active", panels: [registryPanels.sti, registryPanels.womens] },
  { scientific_name: "Helicobacter pylori", common_name: "", type: "bacteria", ncbi_tax_id: 210, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Herpes simplex virus 1", common_name: "HSV-1", type: "virus", ncbi_tax_id: 10298, synonyms: ["Herpes Simplex Virus (HSV-1)"], status: "active", panels: [registryPanels.sti, registryPanels.eye, registryPanels.womens] },
  { scientific_name: "Herpes simplex virus 2", common_name: "HSV-2", type: "virus", ncbi_tax_id: 10310, synonyms: ["Herpes Simplex Virus (HSV-2)"], status: "active", panels: [registryPanels.sti, registryPanels.womens] },
  { scientific_name: "Human orthopneumovirus", common_name: "Respiratory syncytial virus A/B", type: "virus", ncbi_tax_id: 11250, synonyms: ["RSV A/B"], status: "active", panels: [registryPanels.respiratory] },
  { scientific_name: "Human parechovirus", common_name: "", type: "virus", ncbi_tax_id: 12059, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Hypervirulent Clostridioides difficile 027", common_name: "C. diff 027", type: "bacteria", ncbi_tax_id: null, synonyms: ["Hypervirulent C. diff 027"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Influenza A virus", common_name: "Influenza A", type: "virus", ncbi_tax_id: 11320, synonyms: [], status: "active", panels: [registryPanels.respiratory] },
  { scientific_name: "Influenza B virus", common_name: "Influenza B", type: "virus", ncbi_tax_id: 11520, synonyms: [], status: "active", panels: [registryPanels.respiratory] },
  { scientific_name: "Kingella kingae", common_name: "", type: "bacteria", ncbi_tax_id: 488, synonyms: [], status: "active", panels: [registryPanels.wound] },
  { scientific_name: "Klebsiella aerogenes", common_name: "", type: "bacteria", ncbi_tax_id: 548, synonyms: ["Enterobacter aerogenes"], status: "active", panels: [registryPanels.uti, registryPanels.wound] },
  { scientific_name: "Klebsiella oxytoca", common_name: "", type: "bacteria", ncbi_tax_id: 571, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.wound] },
  { scientific_name: "Klebsiella pneumoniae", common_name: "", type: "bacteria", ncbi_tax_id: 573, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.wound] },
  { scientific_name: "Lactobacillus crispatus", common_name: "", type: "bacteria", ncbi_tax_id: 47770, synonyms: [], status: "active", panels: [registryPanels.womens] },
  { scientific_name: "Lactobacillus gasseri", common_name: "", type: "bacteria", ncbi_tax_id: 1596, synonyms: [], status: "active", panels: [registryPanels.womens] },
  { scientific_name: "Lactobacillus iners", common_name: "", type: "bacteria", ncbi_tax_id: 160760, synonyms: [], status: "active", panels: [registryPanels.womens] },
  { scientific_name: "Lactobacillus jensenii", common_name: "", type: "bacteria", ncbi_tax_id: 1599, synonyms: [], status: "active", panels: [registryPanels.womens] },
  { scientific_name: "Listeria monocytogenes", common_name: "", type: "bacteria", ncbi_tax_id: 1639, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Megasphaera type 1", common_name: "", type: "bacteria", ncbi_tax_id: null, synonyms: [], status: "active", panels: [registryPanels.womens] },
  { scientific_name: "Megasphaera type 2", common_name: "", type: "bacteria", ncbi_tax_id: null, synonyms: [], status: "active", panels: [registryPanels.womens] },
  { scientific_name: "Mobiluncus curtisii", common_name: "", type: "bacteria", ncbi_tax_id: null, synonyms: [], status: "active", panels: [registryPanels.womens] },
  { scientific_name: "Mobiluncus mulieris", common_name: "", type: "bacteria", ncbi_tax_id: null, synonyms: [], status: "active", panels: [registryPanels.womens] },
  { scientific_name: "Morganella morganii", common_name: "", type: "bacteria", ncbi_tax_id: 582, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.wound] },
  { scientific_name: "Mycoplasma genitalium", common_name: "", type: "bacteria", ncbi_tax_id: 2097, synonyms: [], status: "active", panels: [registryPanels.sti, registryPanels.womens] },
  { scientific_name: "Mycoplasma hominis", common_name: "", type: "bacteria", ncbi_tax_id: 2095, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.sti, registryPanels.womens] },
  { scientific_name: "Neisseria gonorrhoeae", common_name: "", type: "bacteria", ncbi_tax_id: 485, synonyms: [], status: "active", panels: [registryPanels.sti, registryPanels.womens] },
  { scientific_name: "Norovirus G1", common_name: "", type: "virus", ncbi_tax_id: null, synonyms: ["Norovirus genogroup I"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Norovirus G2", common_name: "", type: "virus", ncbi_tax_id: null, synonyms: ["Norovirus genogroup II"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Plesiomonas shigelloides", common_name: "", type: "bacteria", ncbi_tax_id: 29471, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Prevotella bivia", common_name: "", type: "bacteria", ncbi_tax_id: 165179, synonyms: [], status: "active", panels: [registryPanels.womens] },
  { scientific_name: "Proteus mirabilis", common_name: "", type: "bacteria", ncbi_tax_id: 584, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.wound] },
  { scientific_name: "Proteus vulgaris", common_name: "", type: "bacteria", ncbi_tax_id: 585, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.wound] },
  { scientific_name: "Providencia stuartii", common_name: "", type: "bacteria", ncbi_tax_id: 588, synonyms: [], status: "active", panels: [registryPanels.uti] },
  { scientific_name: "Pseudomonas aeruginosa", common_name: "", type: "bacteria", ncbi_tax_id: 287, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.wound, registryPanels.eye] },
  { scientific_name: "Rotavirus A", common_name: "", type: "virus", ncbi_tax_id: 10933, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Rotavirus B", common_name: "", type: "virus", ncbi_tax_id: 10934, synonyms: ["RVB"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Rotavirus C", common_name: "", type: "virus", ncbi_tax_id: 10935, synonyms: ["RVC"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Salmonella bongori", common_name: "", type: "bacteria", ncbi_tax_id: 54736, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Salmonella enterica", common_name: "", type: "bacteria", ncbi_tax_id: 28901, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Sapovirus I", common_name: "", type: "virus", ncbi_tax_id: null, synonyms: ["Sapovirus genogroup I"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "SARS-CoV-2", common_name: "COVID-19 virus", type: "virus", ncbi_tax_id: 2697049, synonyms: ["Severe acute respiratory syndrome coronavirus 2"], status: "active", panels: [registryPanels.respiratory] },
  { scientific_name: "Serratia marcescens", common_name: "", type: "bacteria", ncbi_tax_id: 615, synonyms: [], status: "active", panels: [registryPanels.uti] },
  { scientific_name: "Shiga toxin-producing Escherichia coli", common_name: "STEC", type: "bacteria", ncbi_tax_id: null, synonyms: ["Shiga toxin-producing E. coli"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Shigella spp", common_name: "", type: "bacteria", ncbi_tax_id: 620, synonyms: ["Shigella species"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Staphylococcus aureus", common_name: "", type: "bacteria", ncbi_tax_id: 1280, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.wound, registryPanels.eye, registryPanels.womens] },
  { scientific_name: "Staphylococcus saprophyticus", common_name: "", type: "bacteria", ncbi_tax_id: 29385, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.wound] },
  { scientific_name: "Streptococcus agalactiae", common_name: "Group B Streptococcus", type: "bacteria", ncbi_tax_id: 1311, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.womens] },
  { scientific_name: "Streptococcus pneumoniae", common_name: "Pneumococcus", type: "bacteria", ncbi_tax_id: 1313, synonyms: [], status: "active", panels: [registryPanels.eye] },
  { scientific_name: "Treponema pallidum", common_name: "", type: "bacteria", ncbi_tax_id: 157, synonyms: [], status: "active", panels: [registryPanels.sti, registryPanels.womens] },
  { scientific_name: "Trichomonas vaginalis", common_name: "", type: "parasite", ncbi_tax_id: 5722, synonyms: [], status: "active", panels: [registryPanels.sti, registryPanels.womens] },
  { scientific_name: "Ureaplasma parvum", common_name: "", type: "bacteria", ncbi_tax_id: 134821, synonyms: [], status: "active", panels: [registryPanels.sti, registryPanels.womens] },
  { scientific_name: "Ureaplasma urealyticum", common_name: "", type: "bacteria", ncbi_tax_id: 2130, synonyms: [], status: "active", panels: [registryPanels.uti, registryPanels.sti, registryPanels.womens] },
  { scientific_name: "Varicella-zoster virus", common_name: "HHV-3", type: "virus", ncbi_tax_id: 10335, synonyms: ["Human alphaherpesvirus 3"], status: "active", panels: [registryPanels.eye] },
  { scientific_name: "Vibrio cholerae (ompW marker)", common_name: "", type: "bacteria", ncbi_tax_id: 666, synonyms: ["Vibrio cholerae - OmpW"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Vibrio cholerae (toxigenic)", common_name: "", type: "bacteria", ncbi_tax_id: 666, synonyms: ["Vibrio cholerae Toxigenic"], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Vibrio parahaemolyticus", common_name: "", type: "bacteria", ncbi_tax_id: 670, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Vibrio vulnificus", common_name: "", type: "bacteria", ncbi_tax_id: 672, synonyms: [], status: "active", panels: [registryPanels.gi] },
  { scientific_name: "Yersinia enterocolitica", common_name: "", type: "bacteria", ncbi_tax_id: 630, synonyms: [], status: "active", panels: [registryPanels.gi] },
];

function makeMasterRegistryId(index) {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

const masterRegistryRecords = masterRegistrySeed.map((item, idx) => ({
  id: makeMasterRegistryId(idx + 1),
  scientific_name: item.scientific_name,
  common_name: item.common_name || "",
  type: item.type,
  ncbi_tax_id: item.ncbi_tax_id,
  synonyms: Array.isArray(item.synonyms) ? item.synonyms : [],
  status: item.status || "active",
  panels: Array.isArray(item.panels) ? item.panels : [],
}));
const resistanceGeneSeed = [
  { resistanceClass: "AmpC Resistance Marker", gene: "ampC", aliases: ["ampC"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "Carbapenem resistance Marker", gene: "NDM", aliases: ["NDM"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "Carbapenem resistance Marker", gene: "KPC", aliases: ["KPC"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "Carbapenem resistance Marker", gene: "OXA-48", aliases: ["OXA-48", "OXA48"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "Carbapenem resistance Marker", gene: "VIM, IMP-7", aliases: ["VIM, IMP-7", "VIM IMP-7", "VIM IMP7"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "ESBL Resistance Marker", gene: "SHV", aliases: ["SHV"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "ESBL Resistance Marker", gene: "TEM", aliases: ["TEM"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "ESBL Resistance Marker", gene: "CTX-M group 1", aliases: ["CTX-M group 1", "CTXM group 1"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "ESBL Resistance Marker", gene: "CTX-M group 2", aliases: ["CTX-M group 2", "CTXM group 2"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "Macrolide Resistance Marker", gene: "mefA", aliases: ["mefA"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "Macrolide Resistance Marker", gene: "ErmA", aliases: ["ErmA"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "Macrolide Resistance Marker", gene: "ErmB", aliases: ["ErmB"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "Methicillin Resistance Marker", gene: "mecA", aliases: ["mecA"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "Methicillin Resistance Marker", gene: "femA", aliases: ["femA"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "Quinolone and fluoroquinolone resistance", gene: "QnrB", aliases: ["QnrB"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "Quinolone and fluoroquinolone resistance", gene: "QnrA", aliases: ["QnrA"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "Vancomycin resistance Marker", gene: "vanA1, vanA2", aliases: ["vanA1, vanA2", "vanA1 vanA2"], status: "active", panels: ["Antibiotic Resistance Panel"] },
  { resistanceClass: "Vancomycin resistance Marker", gene: "vanB", aliases: ["vanB"], status: "active", panels: ["Antibiotic Resistance Panel"] },
];
const masterResistanceGeneCatalog = resistanceGeneSeed.map((item) => ({
  resistanceClass: String(item.resistanceClass || "").trim(),
  gene: String(item.gene || "").trim(),
  aliases: Array.isArray(item.aliases) ? Array.from(new Set(item.aliases.map((value) => String(value || "").trim()).filter(Boolean))) : [],
  status: String(item.status || "active").trim() || "active",
  panels: Array.isArray(item.panels) ? Array.from(new Set(item.panels.map((value) => String(value || "").trim()).filter(Boolean))) : [],
}));

function sanitizeRegistryRecord(raw, index, usedIds = new Set()) {
  const scientificName = String(raw?.scientific_name || "").trim();
  if (!scientificName) return null;

  const baseId = String(raw?.id || makeMasterRegistryId(index + 1)).trim() || makeMasterRegistryId(index + 1);
  let recordId = baseId;
  let suffix = 2;
  while (usedIds.has(recordId)) {
    recordId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(recordId);

  const parsedTaxId = Number(raw?.ncbi_tax_id);
  const taxId = raw?.ncbi_tax_id === null || raw?.ncbi_tax_id === undefined
    ? null
    : (Number.isFinite(parsedTaxId) ? parsedTaxId : null);

  return {
    id: recordId,
    scientific_name: scientificName,
    common_name: String(raw?.common_name || "").trim(),
    type: String(raw?.type || "bacteria").trim() || "bacteria",
    ncbi_tax_id: taxId,
    synonyms: Array.isArray(raw?.synonyms)
      ? Array.from(new Set(raw.synonyms.map((item) => String(item || "").trim()).filter(Boolean)))
      : [],
    status: String(raw?.status || "active").trim() || "active",
    panels: Array.isArray(raw?.panels)
      ? Array.from(new Set(raw.panels.map((item) => String(item || "").trim()).filter(Boolean)))
      : [],
  };
}

function sanitizeResistanceGeneRecord(raw) {
  const gene = String(raw?.gene || "").trim();
  if (!gene) return null;
  return {
    resistanceClass: String(raw?.resistanceClass || "Unclassified").trim() || "Unclassified",
    gene,
    aliases: Array.isArray(raw?.aliases)
      ? Array.from(new Set(raw.aliases.map((item) => String(item || "").trim()).filter(Boolean)))
      : [],
    status: String(raw?.status || "active").trim() || "active",
    panels: Array.isArray(raw?.panels)
      ? Array.from(new Set(raw.panels.map((item) => String(item || "").trim()).filter(Boolean)))
      : [],
  };
}

function snapshotMasterRegistryState() {
  return {
    records: masterRegistryRecords.map((record, index) => sanitizeRegistryRecord(record, index)).filter(Boolean),
    genes: masterResistanceGeneCatalog.map((record) => sanitizeResistanceGeneRecord(record)).filter(Boolean),
    icdCodes: customIcdCatalog.map((record) => sanitizeIcdCatalogRecord(record)).filter(Boolean),
  };
}

function saveMasterRegistryState() {
  try {
    localStorage.setItem(masterRegistryStorageKey, JSON.stringify(snapshotMasterRegistryState()));
  } catch {
    // Ignore storage failures and continue with in-memory state.
  }
}

function loadMasterRegistryState() {
  try {
    const raw = localStorage.getItem(masterRegistryStorageKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    let changed = false;

    if (Array.isArray(parsed?.records)) {
      const usedIds = new Set();
      const nextRecords = parsed.records
        .map((item, index) => sanitizeRegistryRecord(item, index, usedIds))
        .filter(Boolean);
      if (nextRecords.length) {
        masterRegistryRecords.splice(0, masterRegistryRecords.length, ...nextRecords);
        changed = true;
      }
    }

    if (Array.isArray(parsed?.genes)) {
      const nextGenes = parsed.genes
        .map((item) => sanitizeResistanceGeneRecord(item))
        .filter(Boolean);
      if (nextGenes.length) {
        masterResistanceGeneCatalog.splice(0, masterResistanceGeneCatalog.length, ...nextGenes);
        changed = true;
      }
    }

    if (Array.isArray(parsed?.icdCodes)) {
      const nextIcdCodes = parsed.icdCodes
        .map((item) => sanitizeIcdCatalogRecord(item))
        .filter((item) => item && !baseIcdCatalogLookup.has(item.code));
      const currentSerialized = JSON.stringify(customIcdCatalog);
      const nextSerialized = JSON.stringify(nextIcdCodes);
      if (currentSerialized !== nextSerialized) {
        customIcdCatalog.splice(0, customIcdCatalog.length, ...nextIcdCodes);
        changed = true;
      }
    }

    rebuildIcdCatalogState();
    return changed;
  } catch {
    // Ignore malformed state and keep defaults.
    return false;
  }
}

loadMasterRegistryState();
syncAllPanelsToCatalogIcdCodes({ persist: true });

window.addEventListener("storage", (event) => {
  if (event.storageArea !== localStorage) return;

  let shouldRender = false;

  if (event.key === panelCatalogStorageKey) {
    shouldRender = loadPanelCatalogState() || shouldRender;
  }

  if (event.key === masterRegistryStorageKey) {
    shouldRender = loadMasterRegistryState() || shouldRender;
    shouldRender = syncAllPanelsToCatalogIcdCodes({ persist: true }) || shouldRender;
  }

  if (!shouldRender || appShell.classList.contains("hidden")) return;

  if (currentView === "panel-master" || currentView === "master-registry") {
    renderView();
  }
});

let zipCodeDirectory = {};
let zipDataReady = false;
let zipDataPromise = null;

async function loadZipCodeDirectory() {
  if (zipDataReady) return;
  if (!zipDataPromise) {
    zipDataPromise = fetch("/data/us-zips.json", { credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error("zip dataset fetch failed");
        return response.json();
      })
      .then((data) => {
        zipCodeDirectory = data || {};
        zipDataReady = true;
      })
      .catch(() => {
        zipCodeDirectory = {};
        zipDataReady = false;
      });
  }
  await zipDataPromise;
}

async function fetchCsrfToken() {
  const response = await fetch("/api/auth/csrf-token", {
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Unable to initialize CSRF protection.");
  const payload = await response.json();
  csrfToken = payload.csrfToken;
}

function isStateChangingApiRequest(url, method) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(normalizedMethod)) return false;

  try {
    const target = new URL(url, window.location.origin);
    return target.origin === window.location.origin && target.pathname.startsWith("/api/");
  } catch {
    return String(url || "").startsWith("/api/");
  }
}

function isInvalidCsrfError(message) {
  return String(message || "").trim() === "Invalid CSRF token.";
}

async function fetchJsonResponse(url, options) {
  const response = await fetch(url, options);
  const rawText = await response.text();
  let payload = null;
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = null;
    }
  }

  const fallback = `Request failed (${response.status} ${response.statusText}).`;
  return {
    ok: response.ok,
    payload,
    rawText,
    message: response.ok ? "" : payload?.error || rawText || fallback,
  };
}

async function requestJson(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const needsCsrf = isStateChangingApiRequest(url, method);
  const buildOptions = async ({ refreshCsrf = false } = {}) => {
    const headers = new Headers(options.headers || {});
    if (needsCsrf) {
      if (refreshCsrf || !csrfToken) await fetchCsrfToken();
      headers.set("x-csrf-token", csrfToken);
    }
    return {
      ...options,
      method,
      headers,
      credentials: "same-origin",
    };
  };

  let result = await fetchJsonResponse(url, await buildOptions());
  if (!result.ok && needsCsrf && isInvalidCsrfError(result.message)) {
    result = await fetchJsonResponse(url, await buildOptions({ refreshCsrf: true }));
  }

  if (!result.ok) {
    throw new Error(result.message);
  }

  return result.payload || {};
}

function getAdminAuthMode() {
  return authConfig?.adminAuthMode === "oidc" ? "oidc" : "local";
}

function getAdminSsoLoginUrl() {
  return authConfig?.oidcLoginUrl || "/auth/oidc/login";
}

async function ensureAuthConfigLoaded(force = false) {
  if (authConfigPromise && !force) {
    return authConfigPromise;
  }

  authConfigPromise = requestJson("/api/auth/config")
    .then((payload) => {
      authConfig = {
        adminAuthMode: payload?.adminAuthMode === "oidc" ? "oidc" : "local",
        oidcLoginUrl: payload?.oidcLoginUrl || "/auth/oidc/login",
        timeZone: resolveAppTimeZone(payload?.timeZone || defaultAppTimeZone),
      };
      setAppTimeZone(authConfig.timeZone);
      return authConfig;
    })
    .catch((error) => {
      authConfigPromise = null;
      throw error;
    });

  return authConfigPromise;
}

function consumeAuthRedirectMessage() {
  const params = new URLSearchParams(window.location.search);
  const message = params.get("authError");
  if (!message) return "";

  params.delete("authError");
  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash || ""}`;
  window.history.replaceState({}, "", nextUrl);
  return message;
}

function readLegacyLocalArray(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function applyPortalDataPayload(payload) {
  if (payload?.timeZone) {
    setAppTimeZone(payload.timeZone);
  }
  registrationsState = Array.isArray(payload?.registrations) ? payload.registrations : [];
  ordersState = Array.isArray(payload?.orders) ? payload.orders : [];
  uploadResultsLogState = Array.isArray(payload?.uploadResultsLog) ? payload.uploadResultsLog : [];
}

function applyAdminSettingsPayload(payload) {
  const settings = payload?.settings && typeof payload.settings === "object"
    ? payload.settings
    : payload && typeof payload === "object"
    ? payload
    : {};
  const nextTimeZone = resolveAppTimeZone(settings?.timeZone || getAppTimeZone());
  adminSettingsState = {
    timeZone: nextTimeZone,
  };
  authConfig = {
    ...authConfig,
    timeZone: nextTimeZone,
  };
  setAppTimeZone(nextTimeZone);
  return adminSettingsState;
}

async function ensureAdminSettingsLoaded(force = false) {
  if (adminSettingsReady && !force) return adminSettingsState;

  if (!adminSettingsPromise || force) {
    adminSettingsPromise = requestJson("/api/admin/settings")
      .then((payload) => {
        applyAdminSettingsPayload(payload);
        adminSettingsReady = true;
        return adminSettingsState;
      })
      .catch((error) => {
        adminSettingsPromise = null;
        throw error;
      });
  }

  await adminSettingsPromise;
}

function getLegacyPortalData() {
  return {
    registrations: readLegacyLocalArray(registrationsStorageKey),
    orders: readLegacyLocalArray(ordersStorageKey),
    uploadResultsLog: readLegacyLocalArray(uploadResultsLogStorageKey),
  };
}

function hasLegacyPortalData(payload) {
  return Boolean(
    payload.registrations.length
    || payload.orders.length
    || payload.uploadResultsLog.length
  );
}

async function maybeImportLegacyPortalData() {
  try {
    if (localStorage.getItem(portalDataMigrationStorageKey) === "done") return false;
  } catch {
    return false;
  }

  const legacyPayload = getLegacyPortalData();
  if (!hasLegacyPortalData(legacyPayload)) {
    try {
      localStorage.setItem(portalDataMigrationStorageKey, "done");
    } catch {
      // Ignore storage failures.
    }
    return false;
  }

  if (!csrfToken) await fetchCsrfToken();
  await requestJson("/api/portal/import-local", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify(legacyPayload),
  });
  try {
    localStorage.setItem(portalDataMigrationStorageKey, "done");
  } catch {
    // Ignore storage failures.
  }
  return true;
}

async function ensurePortalDataLoaded(options = {}) {
  const force = Boolean(options.force);
  if (portalDataReady && !force) return;

  if (!portalDataPromise || force) {
    portalDataPromise = (async () => {
      let payload = await requestJson("/api/portal/data");
      const imported = await maybeImportLegacyPortalData().catch(() => false);
      if (imported) {
        payload = await requestJson("/api/portal/data");
      }
      applyPortalDataPayload(payload);
      portalDataReady = true;
      return payload;
    })().catch((error) => {
      portalDataPromise = null;
      throw error;
    });
  }

  await portalDataPromise;
}

function renderNav() {
  const visibleViews = getVisibleViews();
  if (!visibleViews.length) {
    nav.innerHTML = "";
    return;
  }

  if (!visibleViews.some((item) => item.key === currentView)) {
    currentView = visibleViews[0].key;
  }

  nav.innerHTML = "";
  visibleViews.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `side-link ${item.key === currentView ? "active" : ""}`;
    button.textContent = item.title;
    button.addEventListener("click", () => {
      setSessionMenuOpen(false);
      currentView = item.key;
      renderNav();
      renderView();
    });
    nav.appendChild(button);
  });
}

function getVisibleViews() {
  if (activeSession.type !== "client") return views;
  const allowedKeys = clientAccessViews[activeSession.accessType] || [];
  return views.filter((item) => allowedKeys.includes(item.key));
}

function setAuthMode(nextMode) {
  authMode = nextMode === "client" ? "client" : "doctor";
  const adminUsesOidc = authMode === "doctor" && getAdminAuthMode() === "oidc";

  authModeButtons.forEach((button) => {
    const isActive = button.getAttribute("data-auth-mode") === authMode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  doctorSsoWrap?.classList.toggle("hidden", !adminUsesOidc);
  doctorEmailWrap?.classList.toggle("hidden", authMode !== "doctor" || adminUsesOidc);
  clientUsernameWrap?.classList.toggle("hidden", authMode !== "client");
  passwordWrap?.classList.toggle("hidden", adminUsesOidc);
  authActions?.classList.toggle("hidden", adminUsesOidc);

  if (authModeHelper) {
    authModeHelper.textContent =
      authMode === "doctor"
        ? adminUsesOidc
          ? "Admins sign in through LabCenter Cloud ID to keep authentication centralized and secure."
          : "Use your assigned LabCenter admin username and password to access the full workspace."
        : "Use your client portal username to review reports and order activity.";
  }

  if (authStage === "login") {
    window.requestAnimationFrame(() => {
      getPrimaryAuthInput()?.focus();
    });
  }
}


function formatDashboardNumber(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return "0";
  return parsed.toLocaleString("en-US");
}

function formatDashboardDateTime(isoValue) {
  return formatAppDateTime(isoValue, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }, "-");
}

function getOrderPanelLabels(order) {
  if (!Array.isArray(order?.services)) return [];
  const labels = [];
  order.services.forEach((line) => {
    if (Array.isArray(line.panelIds) && line.panelIds.length) {
      line.panelIds.forEach((panelId) => {
        const panel = orderPanelCatalog.find((item) => item.id === panelId);
        labels.push(panel ? panel.name : panelId);
      });
      return;
    }
    if (!line?.serviceName) return;
    line.serviceName
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((name) => labels.push(name));
  });
  return labels;
}

function getSpecimenCountFromOrder(order) {
  const panelCount = getOrderPanelLabels(order).length;
  if (panelCount > 0) return panelCount;
  if (Array.isArray(order?.services) && order.services.length > 0) return order.services.length;
  return 1;
}

function getSampleCountFromOrder(order) {
  const summaryCount = Number(order?.processedResult?.report?.summary?.sampleCount);
  if (Number.isFinite(summaryCount) && summaryCount > 0) return summaryCount;
  return getSpecimenCountFromOrder(order);
}

function buildMonthlyOrderTrend(orders, monthCount = 6) {
  const nowParts = resolveDatePartsInAppTimeZone(new Date().toISOString()) || {
    year: String(new Date().getUTCFullYear()),
    month: String(new Date().getUTCMonth() + 1).padStart(2, "0"),
    day: "01",
  };
  const buckets = [];
  for (let index = monthCount - 1; index >= 0; index -= 1) {
    const pivot = shiftYearMonth(Number(nowParts.year), Number(nowParts.month), -index);
    const key = `${pivot.year}-${String(pivot.month).padStart(2, "0")}`;
    buckets.push({
      key,
      label: formatAppMonthLabel(pivot.year, pivot.month),
      fullLabel: formatAppMonthLabel(pivot.year, pivot.month, { includeYear: true }),
      count: 0,
      pending: 0,
      processed: 0,
      complete: 0,
      other: 0,
    });
  }

  const keyToBucket = new Map(buckets.map((item) => [item.key, item]));
  orders.forEach((order) => {
    const parts = resolveDatePartsInAppTimeZone(order.createdAt);
    if (!parts) return;
    const key = `${parts.year}-${parts.month}`;
    const bucket = keyToBucket.get(key);
    if (!bucket) return;
    bucket.count += 1;

    const status = String(order?.status || "").trim().toLowerCase();
    if (status === "pending") bucket.pending += 1;
    else if (status === "processed") bucket.processed += 1;
    else if (status === "complete") bucket.complete += 1;
    else bucket.other += 1;
  });

  return buckets;
}

function getDashboardChartSeries() {
  return [
    { key: "processed", label: "Processed", color: "#7eb79d" },
    { key: "pending", label: "Pending", color: "#ee8b73" },
    { key: "complete", label: "Complete", color: "#f0b748" },
  ];
}

function buildDashboardKpiSparkline(toneClass) {
  return `
    <svg class="dashboard-kpi-sparkline ${toneClass}" viewBox="0 0 86 34" aria-hidden="true">
      <polyline points="6,26 28,8 50,16 80,4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></polyline>
      <circle cx="6" cy="26" r="3.2" fill="#ffffff"></circle>
      <circle cx="28" cy="8" r="3.2" fill="#ffffff"></circle>
      <circle cx="50" cy="16" r="3.2" fill="#ffffff"></circle>
      <circle cx="80" cy="4" r="3.2" fill="#ffffff"></circle>
    </svg>
  `;
}

function getGaugePoint(cx, cy, radius, angleDeg) {
  const angleRad = (Math.PI / 180) * angleDeg;
  return {
    x: cx + (Math.cos(angleRad) * radius),
    y: cy + (Math.sin(angleRad) * radius),
  };
}

function buildGaugeArcPath(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
  const outerStart = getGaugePoint(cx, cy, outerRadius, startAngle);
  const outerEnd = getGaugePoint(cx, cy, outerRadius, endAngle);
  const innerEnd = getGaugePoint(cx, cy, innerRadius, endAngle);
  const innerStart = getGaugePoint(cx, cy, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return `
    M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}
    A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}
    L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}
    A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}
    Z
  `.replace(/\s+/g, " ").trim();
}

function buildDashboardDispositionGaugeSvg(statusCounts) {
  const chartWidth = 420;
  const chartHeight = 280;
  const cx = chartWidth / 2;
  const cy = 164;
  const outerRadius = 124;
  const innerRadius = 82;
  const total = statusCounts.pending + statusCounts.processed + statusCounts.complete + statusCounts.other;
  const segments = [
    { label: "Other", value: statusCounts.other, color: "#d86a57" },
    { label: "Pending", value: statusCounts.pending, color: "#f0b447" },
    { label: "Processed", value: statusCounts.processed, color: "#8cbca1" },
    { label: "Complete", value: statusCounts.complete, color: "#1f4f68" },
  ];
  const resolvedValue = statusCounts.processed + statusCounts.complete;
  const maxValue = Math.max(1, total);
  const needleAngle = 180 + ((resolvedValue / maxValue) * 180);

  let angleCursor = 180;
  const paths = total
    ? segments
        .filter((segment) => segment.value > 0)
        .map((segment) => {
          const angleSpan = (segment.value / total) * 180;
          const nextAngle = angleCursor + angleSpan;
          const path = `<path d="${buildGaugeArcPath(cx, cy, outerRadius, innerRadius, angleCursor, nextAngle)}" fill="${segment.color}"></path>`;
          angleCursor = nextAngle;
          return path;
        })
        .join("")
    : `<path d="${buildGaugeArcPath(cx, cy, outerRadius, innerRadius, 180, 360)}" fill="#d8e4ed"></path>`;

  const needleTip = getGaugePoint(cx, cy, outerRadius - 18, needleAngle);
  const needleLeft = getGaugePoint(cx, cy, 16, needleAngle - 92);
  const needleRight = getGaugePoint(cx, cy, 16, needleAngle + 92);

  return `
    <svg class="dashboard-gauge-svg" viewBox="0 0 ${chartWidth} ${chartHeight}" preserveAspectRatio="xMidYMid meet" aria-label="Specimen disposition gauge">
      <path d="${buildGaugeArcPath(cx, cy, outerRadius, innerRadius, 180, 360)}" fill="#edf3f7"></path>
      ${paths}
      <line x1="${cx - outerRadius}" y1="${cy}" x2="${cx + outerRadius}" y2="${cy}" stroke="#e3ebf2" stroke-width="1"></line>
      <path d="M ${needleLeft.x.toFixed(2)} ${needleLeft.y.toFixed(2)} L ${needleTip.x.toFixed(2)} ${needleTip.y.toFixed(2)} L ${needleRight.x.toFixed(2)} ${needleRight.y.toFixed(2)} Z" fill="#163a4c"></path>
      <circle cx="${cx}" cy="${cy}" r="16" fill="#ffffff" stroke="#dce7f0" stroke-width="4"></circle>
      <circle cx="${cx}" cy="${cy}" r="8" fill="#163a4c"></circle>
      <text x="${cx}" y="${cy + 68}" text-anchor="middle" font-size="34" font-weight="800" fill="#27485d">${formatDashboardNumber(total)}</text>
      <text x="${cx}" y="${cy + 94}" text-anchor="middle" font-size="16" fill="#667b8e">orders tracked</text>
      <text x="${cx - outerRadius + 4}" y="${cy + 22}" text-anchor="start" font-size="15" fill="#7d8ea0">0</text>
      <text x="${cx + outerRadius - 4}" y="${cy + 22}" text-anchor="end" font-size="15" fill="#7d8ea0">${formatDashboardNumber(maxValue)}</text>
    </svg>
  `;
}

function buildDashboardGroupedBarChartSvg(monthlyTrend) {
  const chartWidth = 860;
  const chartHeight = 320;
  const leftPad = 60;
  const rightPad = 22;
  const topPad = 18;
  const bottomPad = 54;
  const plotWidth = chartWidth - leftPad - rightPad;
  const plotHeight = chartHeight - topPad - bottomPad;
  const baselineY = topPad + plotHeight;
  const slotWidth = plotWidth / Math.max(1, monthlyTrend.length);
  const series = getDashboardChartSeries();
  const maxValue = Math.max(
    1,
    ...monthlyTrend.flatMap((bucket) => series.map((item) => Number(bucket[item.key]) || 0))
  );
  let normalizedMax = maxValue + 1;
  let stepValue = 1;
  let stepCount = normalizedMax;

  if (maxValue > 4) {
    stepCount = 5;
    stepValue = Math.max(1, Math.ceil(maxValue / stepCount));
    normalizedMax = stepValue * stepCount;
  }

  const barWidth = Math.min(28, (slotWidth - 30) / Math.max(1, series.length));
  const clusterWidth = (barWidth * series.length) + (series.length - 1) * 8;

  const grid = Array.from({ length: stepCount + 1 }, (_, index) => {
    const value = stepValue * index;
    const ratio = value / normalizedMax;
    const y = Math.round(baselineY - (plotHeight * ratio));
    return `
      <line x1="${leftPad}" y1="${y}" x2="${chartWidth - rightPad}" y2="${y}" stroke="#e7edf2" stroke-width="1"></line>
      <text x="${leftPad - 14}" y="${y + 5}" text-anchor="end" font-size="14" fill="#7b8a99">${value}</text>
    `;
  }).join("");

  const bars = monthlyTrend
    .map((bucket, index) => {
      const groupCenter = leftPad + (slotWidth * index) + (slotWidth / 2);
      const startX = groupCenter - (clusterWidth / 2);
      const monthLabelY = chartHeight - 12;
      const seriesBars = series.map((item, seriesIndex) => {
        const value = Number(bucket[item.key]) || 0;
        const barHeight = value ? Math.max(10, Math.round((value / normalizedMax) * plotHeight)) : 2;
        const x = Math.round(startX + (seriesIndex * (barWidth + 8)));
        const y = Math.round(baselineY - barHeight);
        return `
          <rect x="${x}" y="${y}" width="${Math.round(barWidth)}" height="${barHeight}" rx="9" ry="9" fill="${item.color}" opacity="${value ? "1" : "0.35"}"></rect>
        `;
      }).join("");

      return `
        ${seriesBars}
        <text x="${Math.round(groupCenter)}" y="${monthLabelY}" text-anchor="middle" font-size="15" fill="#667788">${escapeHtml(bucket.label)}</text>
      `;
    })
    .join("");

  return `
    <svg class="dashboard-bar-svg" viewBox="0 0 ${chartWidth} ${chartHeight}" preserveAspectRatio="xMidYMid meet" aria-label="Grouped order progression chart">
      ${grid}
      <line x1="${leftPad}" y1="${baselineY}" x2="${chartWidth - rightPad}" y2="${baselineY}" stroke="#d7e0e8" stroke-width="1.5"></line>
      ${bars}
    </svg>
  `;
}

function renderDashboard() {
  const orders = readOrders();
  const statusCounts = {
    pending: 0,
    processed: 0,
    complete: 0,
    other: 0,
  };
  const panelCounts = {};
  let specimensCollected = 0;
  let samplesCollected = 0;
  let totalRowsProcessed = 0;
  let detectedPathogens = 0;
  let totalDue = 0;

  orders.forEach((order) => {
    const status = String(order.status || "").toLowerCase();
    if (status === "pending") statusCounts.pending += 1;
    else if (status === "processed") statusCounts.processed += 1;
    else if (status === "complete") statusCounts.complete += 1;
    else statusCounts.other += 1;

    const specimens = getSpecimenCountFromOrder(order);
    specimensCollected += specimens;
    samplesCollected += getSampleCountFromOrder(order);
    totalDue += Number(order.due) || 0;

    const summary = order?.processedResult?.report?.summary;
    if (summary) {
      totalRowsProcessed += Number(summary.totalRows) || 0;
      detectedPathogens += Number(summary.detectedCount) || 0;
    }

    const orderPanels = getOrderPanelLabels(order);
    if (!orderPanels.length) {
      panelCounts.Uncategorized = (panelCounts.Uncategorized || 0) + 1;
      return;
    }
    orderPanels.forEach((label) => {
      panelCounts[label] = (panelCounts[label] || 0) + 1;
    });
  });

  const monthlyTrend = buildMonthlyOrderTrend(orders, 6);
  const topPanels = Object.entries(panelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);
  const panelMax = Math.max(1, ...topPanels.map((item) => item[1]));

  const totalDisposition = statusCounts.pending + statusCounts.processed + statusCounts.complete + statusCounts.other;
  const recentOrders = orders
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  panelBody.innerHTML = `
    <section class="dashboard-page">
      <div class="dashboard-head">
        <p class="badge">Operations Dashboard</p>
        <h3>Sample and Specimen Statistics</h3>
        <p class="subtle">Live metrics from all collected orders and uploaded test workbooks.</p>
      </div>

      <section class="dashboard-hero-grid">
        <article class="dashboard-card dashboard-gauge-card">
          <div class="dashboard-card-head">
            <h4>Specimen Disposition</h4>
            <span>Current order statuses</span>
          </div>
          <div class="dashboard-gauge-shell">
            ${buildDashboardDispositionGaugeSvg(statusCounts)}
          </div>
          <div class="dashboard-status-grid">
            <p><span class="dot disposition-pending"></span>Pending <strong>${formatDashboardNumber(statusCounts.pending)}</strong></p>
            <p><span class="dot disposition-processed"></span>Processed <strong>${formatDashboardNumber(statusCounts.processed)}</strong></p>
            <p><span class="dot disposition-complete"></span>Complete <strong>${formatDashboardNumber(statusCounts.complete)}</strong></p>
            <p><span class="dot disposition-other"></span>Other <strong>${formatDashboardNumber(statusCounts.other)}</strong></p>
          </div>
          <p class="dashboard-inline-note">Outstanding Due <strong>$${formatDashboardNumber(totalDue)}</strong></p>
        </article>

        <article class="dashboard-card dashboard-chart-card">
          <div class="dashboard-card-head">
            <h4>Order Progression (Last 6 Months)</h4>
            <span>${formatDashboardNumber(orders.length)} total orders</span>
          </div>
          <div class="dashboard-chart-shell">
            ${buildDashboardGroupedBarChartSvg(monthlyTrend)}
          </div>
          <div class="dashboard-chart-legend">
            ${
              getDashboardChartSeries()
                .map((item) => `<span><i style="background:${item.color}"></i>${item.label}</span>`)
                .join("")
            }
          </div>
        </article>
      </section>

      <section class="dashboard-kpis">
        <article class="dashboard-kpi kpi-specimens">
          <p>Total Specimens Collected</p>
          <div class="dashboard-kpi-row">
            <h4>${formatDashboardNumber(specimensCollected)}</h4>
            ${buildDashboardKpiSparkline("spark-specimens")}
          </div>
          <span>Across ${formatDashboardNumber(orders.length)} orders</span>
        </article>
        <article class="dashboard-kpi kpi-samples">
          <p>Total Samples Captured</p>
          <div class="dashboard-kpi-row">
            <h4>${formatDashboardNumber(samplesCollected)}</h4>
            ${buildDashboardKpiSparkline("spark-samples")}
          </div>
          <span>Includes processed workbook sample counts</span>
        </article>
        <article class="dashboard-kpi kpi-detected">
          <p>Detected Pathogens</p>
          <div class="dashboard-kpi-row">
            <h4>${formatDashboardNumber(detectedPathogens)}</h4>
            ${buildDashboardKpiSparkline("spark-detected")}
          </div>
          <span>From ${formatDashboardNumber(totalRowsProcessed)} tested targets</span>
        </article>
        <article class="dashboard-kpi kpi-pending">
          <p>Pending Orders</p>
          <div class="dashboard-kpi-row">
            <h4>${formatDashboardNumber(statusCounts.pending)}</h4>
            ${buildDashboardKpiSparkline("spark-pending")}
          </div>
          <span>${formatDashboardNumber(statusCounts.processed + statusCounts.complete)} completed or processed</span>
        </article>
      </section>

      <section class="dashboard-grid">
        <article class="dashboard-card dashboard-type-card">
          <div class="dashboard-card-head">
            <h4>Orders By Panel Type</h4>
            <span>Most requested services</span>
          </div>
          <div class="panel-bars">
            ${
              topPanels.length
                ? topPanels
                    .map(([label, count]) => {
                      const width = Math.max(6, Math.round((count / panelMax) * 100));
                      return `
                        <div class="panel-bar-row">
                          <span>${label}</span>
                          <div class="panel-bar-track"><div class="panel-bar-fill" style="width: ${width}%"></div></div>
                          <strong>${count}</strong>
                        </div>
                      `;
                    })
                    .join("")
                : '<p class="subtle">No panel data available yet.</p>'
            }
          </div>
        </article>

        <article class="dashboard-card dashboard-recent-card">
          <div class="dashboard-card-head">
            <h4>Recent Collection Activity</h4>
            <span>Newest orders and specimen timestamps</span>
          </div>
          <div class="dashboard-recent-table-wrap">
            <table class="dashboard-recent-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Patient</th>
                  <th>Collected</th>
                  <th>Specimens</th>
                  <th>Samples</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${
                  recentOrders.length
                    ? recentOrders
                        .map((order) => {
                          const statusRaw = String(order.status || "Other");
                          const statusKey = statusRaw.toLowerCase();
                          const badgeClass = statusKey === "pending"
                            ? "pending"
                            : statusKey === "processed"
                              ? "processed"
                              : statusKey === "complete"
                                ? "complete"
                                : "other";
                          return `
                            <tr>
                              <td>#${order.orderId || "-"}</td>
                              <td>${order.patientName || "-"}</td>
                              <td>${formatDashboardDateTime(order.sampleCollectTime || order.createdAt)}</td>
                              <td>${formatDashboardNumber(getSpecimenCountFromOrder(order))}</td>
                              <td>${formatDashboardNumber(getSampleCountFromOrder(order))}</td>
                              <td><span class="status-pill ${badgeClass}">${statusRaw}</span></td>
                            </tr>
                          `;
                        })
                        .join("")
                    : '<tr><td colspan="6" class="empty-state">No orders available yet.</td></tr>'
                }
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </section>
  `;
}

function readRegistrations() {
  return Array.isArray(registrationsState) ? registrationsState.slice() : [];
}

function writeRegistrations(items) {
  registrationsState = Array.isArray(items) ? items.slice() : [];
}

async function saveRegistrationData(data) {
  if (!csrfToken) await fetchCsrfToken();
  const payload = await requestJson("/api/portal/registrations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify({
      registration: {
        ...data,
        createdAt: data?.createdAt || new Date().toISOString(),
      },
    }),
  });
  const nextRecords = readRegistrations().filter((row) => String(row?.createdAt || "") !== String(payload?.registration?.createdAt || ""));
  nextRecords.unshift(payload.registration);
  writeRegistrations(nextRecords);
  return Number(payload?.totalCount || nextRecords.length);
}

async function updatePatientProfile(data) {
  const patientId = String(data?.patientId || "").trim();
  if (!patientId) {
    throw new Error("Patient ID is required.");
  }
  if (!csrfToken) await fetchCsrfToken();
  const payload = await requestJson(`/api/portal/patients/${encodeURIComponent(patientId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify({
      patient: {
        ...data,
        patientId,
      },
    }),
  });
  applyPortalDataPayload(payload);
  return payload;
}

function normalizePatientText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function getAllKnownPatients() {
  return [...readRegistrations(), ...patientDirectory];
}

function isSamePatient(a, b) {
  if (!a || !b) return false;

  const aFirst = normalizePatientText(a.firstName);
  const bFirst = normalizePatientText(b.firstName);
  const aMiddle = normalizePatientText(a.middleName);
  const bMiddle = normalizePatientText(b.middleName);
  const aLast = normalizePatientText(a.lastName);
  const bLast = normalizePatientText(b.lastName);
  const aSuffix = normalizePatientText(a.suffix);
  const bSuffix = normalizePatientText(b.suffix);
  const aDob = String(a.dob || "").trim();
  const bDob = String(b.dob || "").trim();

  return Boolean(aFirst && bFirst && aLast && bLast && aDob && bDob
    && aFirst === bFirst
    && aMiddle === bMiddle
    && aLast === bLast
    && aSuffix === bSuffix
    && aDob === bDob);
}

function findExistingPatientRecord(candidate) {
  return getAllKnownPatients().find((row) => isSamePatient(row, candidate)) || null;
}

function getNextPatientId() {
  const seed = 7739;
  const maxExisting = getAllKnownPatients().reduce((max, row) => {
    const parsed = Number.parseInt(String(row?.patientId || "").trim(), 10);
    if (!Number.isFinite(parsed)) return max;
    return Math.max(max, parsed);
  }, seed - 1);
  return maxExisting + 1;
}

function resolvePatientId(candidate, displayedId = "") {
  const existing = findExistingPatientRecord(candidate);
  if (existing?.patientId) return String(existing.patientId).trim();

  const shown = String(displayedId || "").trim();
  if (/^\d+$/.test(shown)) {
    const used = getAllKnownPatients().some((row) => String(row?.patientId || "").trim() === shown);
    if (!used) return shown;
  }

  return String(getNextPatientId());
}

function readOrders() {
  return Array.isArray(ordersState) ? ordersState.slice() : [];
}

function writeOrders(items) {
  ordersState = Array.isArray(items) ? items.slice() : [];
}

// Shared order persistence helper for Order History and Pending PharmD actions.
// Keeping this outside individual renderers avoids scope-only runtime failures.
async function updateOrderById(orderId, mutator) {
  const orders = readOrders();
  const idx = orders.findIndex((row) => Number(row.orderId) === Number(orderId));
  if (idx < 0) return false;
  const updated = mutator({ ...orders[idx] });
  if (!updated) return false;
  if (!csrfToken) await fetchCsrfToken();
  const payload = await requestJson(`/api/portal/orders/${encodeURIComponent(orderId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify({ order: updated }),
  });
  orders[idx] = payload.order;
  writeOrders(orders);
  return true;
}

function readUploadResultsLog() {
  return Array.isArray(uploadResultsLogState) ? uploadResultsLogState.slice() : [];
}

function writeUploadResultsLog(items) {
  uploadResultsLogState = Array.isArray(items) ? items.slice() : [];
}

async function appendUploadResultsLog(entries) {
  const nextEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!nextEntries.length) return;
  if (!csrfToken) await fetchCsrfToken();
  const payload = await requestJson("/api/portal/upload-log", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify({ entries: nextEntries }),
  });
  applyPortalDataPayload(payload);
}

function parseOrderIdNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatOrderId(value) {
  const parsed = parseOrderIdNumber(value);
  if (!Number.isFinite(parsed) || parsed < 0) return "";
  return String(parsed).padStart(orderIdPadLength, "0");
}

function getOrderIdMatchKey(value) {
  const parsed = parseOrderIdNumber(value);
  if (Number.isFinite(parsed)) return `n:${parsed}`;
  return `s:${String(value ?? "").trim()}`;
}

function getNextOrderId() {
  const current = readOrders();
  const maxId = current.reduce((max, row) => {
    const parsed = parseOrderIdNumber(row?.orderId);
    if (!Number.isFinite(parsed)) return max;
    return Math.max(max, parsed);
  }, orderIdStartNumber - 1);
  return formatOrderId(maxId + 1);
}

async function allocateOrderIds(count) {
  const requestedCount = Math.max(1, Math.floor(Number(count || 0)));
  if (!csrfToken) await fetchCsrfToken();
  const payload = await requestJson("/api/portal/order-ids", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify({ count: requestedCount }),
  });
  return Array.isArray(payload?.orderIds) ? payload.orderIds : [];
}

async function saveOrderRecords(records) {
  const nextRecords = Array.isArray(records) ? records.filter(Boolean) : [];
  if (!nextRecords.length) return 0;
  if (!csrfToken) await fetchCsrfToken();
  const payload = await requestJson("/api/portal/orders/bulk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify({ orders: nextRecords }),
  });
  const existing = readOrders().filter((row) => !payload.orders.some((saved) => String(saved?.orderId || "") === String(row?.orderId || "")));
  writeOrders([...(Array.isArray(payload.orders) ? payload.orders : []), ...existing]);
  return readOrders().length;
}

function toDateTimeLocal(isoString) {
  if (!isoString) return "";
  const value = new Date(isoString);
  if (Number.isNaN(value.getTime())) return "";
  const offset = value.getTimezoneOffset();
  const local = new Date(value.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function nowDateTimeLocal() {
  return toDateTimeLocal(new Date().toISOString());
}

function asPatientRecord(record) {
  return {
    referenceLab: record.referenceLab || "",
    providerNpi: record.providerNpi || "",
    patientId: record.patientId || "",
    firstName: record.firstName || "",
    middleName: record.middleName || "",
    lastName: record.lastName || "",
    suffix: record.suffix || "",
    sex: record.sex || "",
    dob: record.dob || "",
    phone: record.phone || "",
    mrn: record.mrn || "",
    provider: record.provider || "",
    facilityName: record.facilityName || "",
    address2: record.address2 || "",
    city: record.city || "",
    state: record.state || "",
    country: record.country || "",
    email: record.email || "",
    address: record.address || "",
    zipcode: record.zipcode || "",
    county: record.county || "",
    ethnicity: record.ethnicity || "",
    race: record.race || "",
    patientType: record.patientType || "",
    phoneBelongsTo: record.phoneBelongsTo || "Patient",
    billingType: record.billingType || "",
    primaryInsurance: record.primaryInsurance || "",
    primaryMemberPolicy: record.primaryMemberPolicy || "",
    primaryGroup: record.primaryGroup || "",
    primaryGroupNo: record.primaryGroupNo || "",
    primaryAttachments: record.primaryAttachments || "",
    insurancePhone: record.insurancePhone || "",
    secondaryInsurance: record.secondaryInsurance || "",
    secondaryMemberPolicy: record.secondaryMemberPolicy || "",
    secondaryGroup: record.secondaryGroup || "",
    secondaryGroupNo: record.secondaryGroupNo || "",
    secondaryAttachments: record.secondaryAttachments || "",
    tertiaryInsurance: record.tertiaryInsurance || "",
    tertiaryMemberPolicy: record.tertiaryMemberPolicy || "",
    tertiaryGroup: record.tertiaryGroup || "",
    tertiaryGroupNo: record.tertiaryGroupNo || "",
    tertiaryAttachments: record.tertiaryAttachments || "",
    workersCompensation: record.workersCompensation || "",
    workersMemberPolicy: record.workersMemberPolicy || "",
    compensationManager: record.compensationManager || "",
    injuryDate: record.injuryDate || "",
    collectionDate: record.collectionDate || "",
    collectionTime: record.collectionTime || "",
    receivedDate: record.receivedDate || "",
    additionalInformation: record.additionalInformation || "",
    age: record.age || "",
    allergyCustomList: record.allergyCustomList || "",
    createdAt: record.createdAt || "",
  };
}

function getPatientSearchRecordKey(record) {
  const patientId = String(record?.patientId || "").trim();
  if (patientId) return `patient:${patientId}`;

  const mrn = normalizePatientText(record?.mrn);
  if (mrn) return `mrn:${mrn}`;

  const fullName = normalizePatientText(
    `${record?.firstName || ""} ${record?.middleName || ""} ${record?.lastName || ""}`
  );
  const dob = String(record?.dob || "").trim();
  const phone = normalizePhoneDigits(record?.phone);
  const fallback = [fullName, dob, phone].filter(Boolean).join("|");
  if (fallback) return `person:${fallback}`;

  const createdAt = String(record?.createdAt || "").trim();
  if (createdAt) return `created:${createdAt}`;
  return "";
}

function splitFullNameParts(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) {
    return {
      firstName: "",
      middleName: "",
      lastName: "",
    };
  }
  const parts = text.split(" ");
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      middleName: "",
      lastName: "",
    };
  }
  if (parts.length === 2) {
    return {
      firstName: parts[0],
      middleName: "",
      lastName: parts[1],
    };
  }
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function buildOrderPatientDisplayName(record) {
  const full = `${record?.firstName || ""} ${record?.middleName || ""} ${record?.lastName || ""}`.replace(/\s+/g, " ").trim();
  if (full) return full;
  return String(record?.patientName || "").trim() || "-";
}

function resolveOrderPatientRecordForPharmd(order) {
  const records = readRegistrations()
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const patientId = String(order?.patientId || "").trim();
  if (patientId) {
    const matchedById = records.find((row) => String(row?.patientId || "").trim() === patientId);
    if (matchedById) return matchedById;
  }

  const orderName = normalizePanelKey(order?.patientName || "");
  if (orderName) {
    const matchedByName = records.find((row) => normalizePanelKey(buildOrderPatientDisplayName(row)) === orderName);
    if (matchedByName) return matchedByName;
  }

  return null;
}

function normalizePharmdToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function matchesResistanceGeneCatalog(value) {
  const token = normalizePharmdToken(value);
  if (!token) return false;
  return masterResistanceGeneCatalog.some((record) => {
    const candidates = [record?.gene, ...(Array.isArray(record?.aliases) ? record.aliases : [])];
    return candidates.some((item) => {
      const candidate = normalizePharmdToken(item);
      return candidate && (token === candidate || token.includes(candidate) || candidate.includes(token));
    });
  });
}

function isTruthyPharmdField(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Boolean(normalized && !["0", "false", "no", "off"].includes(normalized));
}

function escapeHl7Text(value) {
  return String(value || "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\\/g, "\\E\\")
    .replace(/\|/g, "\\F\\")
    .replace(/\^/g, "\\S\\")
    .replace(/~/g, "\\R\\")
    .replace(/&/g, "\\T\\");
}

function formatHl7Timestamp(value, { dateOnly = false } = {}) {
  const parts = resolveDateTimePartsInAppTimeZone(value || new Date().toISOString())
    || resolveDateTimePartsInAppTimeZone(new Date().toISOString());
  if (!parts) return "";
  if (dateOnly) return `${parts.year}${parts.month}${parts.day}`;
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
}

function resolvePharmdAccession(order) {
  const existing = String(order?.accessionNo || order?.accession || "").trim();
  if (existing) return existing;
  if (!order?.orderId) return "";
  return buildAccessionNumber({
    serviceLine: order?.services?.[0] || {},
    orderDate: order?.sampleCollectTime || order?.createdAt,
    orderId: order.orderId,
  });
}

function pickPharmdMetadataValue(metadata, aliases = []) {
  const source = metadata && typeof metadata === "object" ? metadata : {};
  const entries = Object.entries(source);
  const normalizedAliases = aliases
    .map((item) => normalizePharmdToken(item))
    .filter(Boolean);
  if (!normalizedAliases.length) return "";
  const matched = entries.find(([key]) => normalizedAliases.includes(normalizePharmdToken(key)));
  return matched ? String(matched[1] || "").trim() : "";
}

function resolvePharmdSpecimenType(order, patientRecord) {
  if (patientRecord?.specimenTypeOtherText) return String(patientRecord.specimenTypeOtherText).trim();
  if (isTruthyPharmdField(patientRecord?.specimenTypeSwab)) return "Swab";
  if (isTruthyPharmdField(patientRecord?.specimenTypeWound)) return "Wound";
  if (isTruthyPharmdField(patientRecord?.specimenTypeOther)) return "Others";
  const metadata = order?.processedResult?.report?.metadata;
  return pickPharmdMetadataValue(metadata, ["Specimen Type", "Sample Type"]) || "Swab";
}

function resolvePharmdSpecimenSite(order, patientRecord) {
  if (patientRecord?.specimenTypeWoundLocation) return String(patientRecord.specimenTypeWoundLocation).trim();
  const metadata = order?.processedResult?.report?.metadata;
  return pickPharmdMetadataValue(metadata, ["Specimen Source Site", "Source Site", "Collection Site"]);
}

function formatAllergyFieldLabel(fieldName) {
  return String(fieldName || "")
    .replace(/^allergy_/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildPharmdPatientNotes(order, patientRecord) {
  const allergies = Object.entries(patientRecord || {})
    .filter(([key, value]) => key.startsWith("allergy_") && isTruthyPharmdField(value))
    .map(([key]) => formatAllergyFieldLabel(key));
  const customAllergies = String(patientRecord?.allergyCustomList || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const notes = [];
  const allergyItems = [...new Set([...allergies, ...customAllergies])];
  if (allergyItems.length) notes.push(`Allergies: ${allergyItems.join(", ")}`);
  const additional = String(patientRecord?.additionalInformation || order?.pharmd?.notes || "").trim();
  if (additional) notes.push(`Notes: ${additional}`);
  return notes;
}

function resolvePharmdObservationType(row) {
  const explicitType = String(row?.recordType || row?.observationType || "").trim().toLowerCase();
  if (["abr", "resistance", "resistancegene", "resistancegenes"].includes(explicitType)) return "Resistance Genes";
  if (["pathogen", "pathogens"].includes(explicitType)) return "Pathogens";
  return matchesResistanceGeneCatalog(row?.pathogen || row?.target || "") ? "Resistance Genes" : "Pathogens";
}

function formatPharmdObservationValue(row) {
  const raw = String(row?.result || row?.ampStatus || "").trim();
  const normalized = raw.toLowerCase();
  if (!normalized) return "Not Detected";
  if (normalized.includes("inconclusive")) return "Not Detected";
  if (normalized.includes("not detected") || normalized === "-" || normalized.includes("negative") || normalized.includes("undetermined")) {
    return "Not Detected";
  }
  if (normalized.includes("detected")) {
    if (normalized.includes("high")) return "Detected - High";
    if (normalized.includes("moderate")) return "Detected - Moderate";
    if (normalized.includes("low")) return "Detected - Low";
    return "Detected";
  }
  if (normalized.includes("positive")) {
    if (normalized.includes("high")) return "Detected - High";
    if (normalized.includes("moderate")) return "Detected - Moderate";
    if (normalized.includes("low")) return "Detected - Low";
    return "Detected";
  }
  const classification = String(row?.classification || "").trim().toLowerCase();
  if (classification.includes("high")) return "Detected - High";
  if (classification.includes("moderate")) return "Detected - Moderate";
  if (classification.includes("low")) return "Detected - Low";
  return raw;
}

function buildPharmdOruMessage(order) {
  if (!order) return "";
  const patientRecord = resolveOrderPatientRecordForPharmd(order) || {};
  const nameParts = splitFullNameParts(order?.patientName || buildOrderPatientDisplayName(patientRecord));
  const providerParts = splitFullNameParts(order?.provider || patientRecord?.provider || "");
  const sendingApplication = String(patientRecord?.referenceLab || "LabCenter").trim() || "LabCenter";
  const sendingFacility = String(order?.facilityName || patientRecord?.facilityName || "LabCenter").trim() || "LabCenter";
  const panelLine = order?.services?.[0] || {};
  const panelId = String(panelLine?.panelIds?.[0] || "").trim();
  const panelName = String(panelLine?.serviceName || order?.processedResult?.report?.panelName || "Lab Panel").trim() || "Lab Panel";
  const accession = resolvePharmdAccession(order);
  const messageTimestamp = formatHl7Timestamp(order?.pharmd?.sentAt || order?.processedAt || order?.updatedAt || order?.createdAt);
  const messageControlId = escapeHl7Text(
    String(order?.pharmd?.messageControlId || `${order?.orderId || "ORDER"}-${messageTimestamp}`).trim()
  );
  const patientDob = formatHl7Timestamp(patientRecord?.dob || order?.patientDob || "", { dateOnly: true });
  const sex = String(patientRecord?.sex || order?.sex || "").trim().toUpperCase();
  const sexCode = sex.startsWith("F") ? "F" : sex.startsWith("M") ? "M" : sex.startsWith("O") ? "O" : "U";
  const patientId = escapeHl7Text(String(order?.patientId || patientRecord?.patientId || "").trim());
  const patientAddress = [
    escapeHl7Text(patientRecord?.address || ""),
    escapeHl7Text(patientRecord?.address2 || ""),
    escapeHl7Text(patientRecord?.city || ""),
    escapeHl7Text(patientRecord?.state || ""),
    escapeHl7Text(patientRecord?.zipcode || ""),
  ];
  const notes = buildPharmdPatientNotes(order, patientRecord);
  const collectionTimestamp = formatHl7Timestamp(
    order?.sampleCollectTime || patientRecord?.collectionDate || order?.createdAt
  );
  const specimenType = escapeHl7Text(resolvePharmdSpecimenType(order, patientRecord));
  const specimenSite = escapeHl7Text(resolvePharmdSpecimenSite(order, patientRecord));
  const detailedRowsSource = Array.isArray(order?.processedResult?.report?.detailed)
    ? order.processedResult.report.detailed
    : [];
  const detailedRows = filterFinalReportRows(detailedRowsSource).filter((row) => String(row?.pathogen || row?.target || "").trim());
  if (!detailedRows.length) return "";

  const segments = [
    `MSH|^~\\&|${escapeHl7Text(sendingApplication)}|${escapeHl7Text(sendingFacility)}|PharmD|CPD|${messageTimestamp}||ORU^R01|${messageControlId}|P|2.5.1`,
    `PID|1|${patientId}|||${escapeHl7Text(nameParts.lastName)}^${escapeHl7Text(nameParts.firstName)}^${escapeHl7Text(nameParts.middleName)}||${patientDob}|${sexCode}|||${patientAddress.join("^")}|`,
  ];

  notes.forEach((note, index) => {
    segments.push(`NTE|${index + 1}|P|${escapeHl7Text(note)}|`);
  });

  segments.push(`PV1|1|P|^${escapeHl7Text(sendingFacility)}||||^${escapeHl7Text(providerParts.lastName)}^${escapeHl7Text(providerParts.firstName)}`);
  segments.push(`ORC|RE|${escapeHl7Text(String(order?.orderId || "").trim())}|||||||${collectionTimestamp}|`);
  segments.push(`SPM|1|||^${specimenType}||||^${specimenSite}`);
  segments.push(`OBR|1||${escapeHl7Text(accession)}|${escapeHl7Text(panelId)}^${escapeHl7Text(panelName)}|`);

  detailedRows.forEach((row, index) => {
    const label = escapeHl7Text(String(row?.pathogen || row?.target || "").trim());
    const subId = escapeHl7Text(resolvePharmdObservationType(row));
    const resultValue = escapeHl7Text(formatPharmdObservationValue(row));
    segments.push(`OBX|${index + 1}|ST|^${label}|${subId}|${resultValue}|`);
  });

  return segments.join("\r");
}

function resolvePharmdOruMessage(order) {
  const candidates = [
    order?.pharmd?.oruMessage,
    order?.pharmd?.hl7Message,
    order?.pharmd?.message,
    order?.pharmd?.oru?.message,
  ];
  const existing = candidates.find((item) => typeof item === "string" && item.trim());
  return existing ? existing.trim() : buildPharmdOruMessage(order);
}

function resolvePharmdStatusInfo(order) {
  const pharmd = order?.pharmd && typeof order.pharmd === "object" ? order.pharmd : {};
  const statusToken = String(
    pharmd?.status
    || pharmd?.sendStatus
    || pharmd?.deliveryStatus
    || pharmd?.oruStatus
    || ""
  ).trim().toLowerCase();
  if (pharmd?.skipPharmd) {
    return {
      label: "Skip Enabled",
      className: "status-processed",
      detail: "Using the stored final report for validation.",
    };
  }
  if (pharmd?.error) {
    return {
      label: "Send Failed",
      className: "status-rejected",
      detail: String(pharmd.error || "").trim(),
    };
  }
  if (pharmd?.receivedAt || pharmd?.pdfReceivedAt || pharmd?.reportReceivedAt) {
    return {
      label: "Report Received",
      className: "status-complete",
      detail: String(pharmd?.reportReceivedFileName || "").trim()
        ? `Stored return file: ${String(pharmd.reportReceivedFileName).trim()}`
        : "",
    };
  }
  if (pharmd?.prePublishedAt) {
    return {
      label: "PrePublished",
      className: "status-processed",
      detail: "Final report stored and ready for PharmD.",
    };
  }
  if (["sent", "delivered", "transmitted", "uploaded"].includes(statusToken) || pharmd?.sentAt || pharmd?.submittedAt) {
    const autoChecks = Math.max(0, Number(pharmd?.receiptAutoCheckCount || 0) || 0);
    const maxChecks = Math.max(0, Number(pharmd?.receiptMaxChecks || 0) || 0);
    const nextCheckAt = String(pharmd?.receiptNextCheckAt || "").trim();
    const lastReceiptError = String(pharmd?.receiptLastError || "").trim();
    const exhausted = String(pharmd?.receiptPollingStatus || "").trim().toLowerCase() === "exhausted";
    let detail = "";
    if (exhausted && maxChecks) {
      detail = `Auto-check limit reached (${autoChecks}/${maxChecks}). Use Manual Check to retry.`;
    } else if (lastReceiptError && String(pharmd?.receiptLastCheckResult || "").trim().toLowerCase() === "error") {
      detail = lastReceiptError;
    } else if (maxChecks) {
      detail = `Auto-checks ${autoChecks}/${maxChecks}.`;
      if (nextCheckAt) {
        detail += ` Next check ${formatDashboardDateTime(nextCheckAt)}.`;
      }
    }
    return {
      label: "Sent",
      className: "status-processed",
      detail,
    };
  }
  if (["queued", "pending", "pending send", "ready", "ready to send"].includes(statusToken) || order?.processedResult?.report) {
    return {
      label: "Queued",
      className: "status-pending",
      detail: "",
    };
  }
  return {
    label: "Not Started",
    className: "status-pending",
    detail: "",
  };
}

function resolvePharmdQueuedOrSentAt(order) {
  return order?.pharmd?.sentAt
    || order?.pharmd?.submittedAt
    || order?.pharmd?.queuedAt
    || order?.pharmd?.messageCreatedAt
    || order?.pharmd?.prePublishedAt
    || order?.pharmd?.skipPharmdAt
    || order?.processedAt
    || "";
}

function resolvePharmdReportReceivedAt(order) {
  return order?.pharmd?.receivedAt
    || order?.pharmd?.pdfReceivedAt
    || order?.pharmd?.reportReceivedAt
    || "";
}

function resolvePharmdReceivedFileRecord(order) {
  return order?.pharmd?.receivedReport && typeof order.pharmd.receivedReport === "object"
    ? order.pharmd.receivedReport
    : null;
}

function resolvePharmdReceivedFileName(order) {
  return String(
    order?.pharmd?.receivedReport?.fileName
    || order?.pharmd?.reportReceivedFileName
    || ""
  ).trim();
}

function hasPharmdReceivedFile(order) {
  const record = resolvePharmdReceivedFileRecord(order);
  return Boolean(
    String(record?.bucket || "").trim()
    && String(record?.key || "").trim()
  );
}

function canPreviewCombinedPharmdReport(order) {
  return Boolean(hasSavedFinalReport(order) && hasPharmdReceivedFile(order));
}

function buildCombinedPharmdPreviewFileName(orderId) {
  const normalizedOrderId = String(orderId || "").trim() || "Combined";
  return `Order_${normalizedOrderId}_Final_PharmD_Combined.pdf`;
}

function resolvePharmdMessageFileName(order) {
  const explicit = String(
    order?.pharmd?.messageFileName
    || order?.pharmd?.oruFileName
    || ""
  ).trim();
  if (explicit) return explicit;
  const accession = resolvePharmdAccession(order);
  const stem = accession || `Order_${String(order?.orderId || "").trim() || "PharmD"}`;
  return `${stem}_PharmD_ORU.hl7`;
}

function hasSavedFinalReport(order) {
  return Boolean(
    String(order?.generatedReports?.final?.bucket || "").trim()
    && String(order?.generatedReports?.final?.key || "").trim()
  );
}

function isPharmdSkipped(order) {
  return Boolean(order?.pharmd?.skipPharmd);
}

function canValidatePharmdFinalReport(order) {
  if (!hasSavedFinalReport(order)) return false;
  return Boolean(isPharmdSkipped(order) || resolvePharmdReportReceivedAt(order));
}

function openPlainTextPreviewWindow({ title, heading, content }) {
  const previewWindow = window.open("", "_blank", "popup=yes,width=960,height=760");
  if (!previewWindow) {
    alert("Unable to open preview window. Please allow pop-ups and try again.");
    return false;
  }
  previewWindow.document.open();
  previewWindow.document.write(`
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(title || "Preview")}</title>
      <style>
        html, body {
          margin: 0;
          min-height: 100%;
          background: #f4f7fb;
          color: #24384f;
          font-family: Arial, sans-serif;
        }
        body {
          padding: 24px;
        }
        .preview-shell {
          max-width: 1100px;
          margin: 0 auto;
          background: #fff;
          border: 1px solid #d0dae5;
          border-radius: 16px;
          box-shadow: 0 18px 40px rgba(24, 44, 72, 0.12);
          overflow: hidden;
        }
        .preview-head {
          padding: 18px 22px;
          border-bottom: 1px solid #dce4ec;
        }
        .preview-head h3 {
          margin: 0;
          font-size: 20px;
        }
        .preview-head p {
          margin: 6px 0 0;
          color: #597087;
          font-size: 14px;
        }
        pre {
          margin: 0;
          padding: 22px;
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 13px;
          line-height: 1.5;
          background: #f8fbfe;
        }
      </style>
    </head>
    <body>
      <section class="preview-shell">
        <header class="preview-head">
          <h3>${escapeHtml(heading || title || "Preview")}</h3>
          <p>Read-only HL7 message preview</p>
        </header>
        <pre>${escapeHtml(String(content || "").replace(/\r/g, "\n"))}</pre>
      </section>
    </body>
    </html>
  `);
  previewWindow.document.close();
  return true;
}

function downloadPlainTextFile({ content, fileName, mimeType = "text/plain;charset=utf-8" }) {
  const blob = new Blob([String(content || "")], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "download.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getSearchablePatients() {
  const merged = new Map();

  patientDirectory.forEach((record) => {
    const patient = asPatientRecord(record);
    const key = getPatientSearchRecordKey(patient);
    if (!key) return;
    merged.set(key, {
      ...patient,
      __patientSearchKey: key,
      __hasStoredProfile: false,
    });
  });

  readRegistrations()
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .forEach((record) => {
      const patient = asPatientRecord(record);
      const key = getPatientSearchRecordKey(patient);
      if (!key) return;
      const existing = merged.get(key);
      if (existing?.__hasStoredProfile) return;
      merged.set(key, {
        ...(existing || {}),
        ...patient,
        __patientSearchKey: key,
        __hasStoredProfile: true,
      });
    });

  return Array.from(merged.values());
}

function formatDateForCard(isoDate) {
  if (!isoDate) return "Unknown";
  return formatAppDate(isoDate, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }, isoDate);
}

function calcAge(dob) {
  if (!dob) return "";
  const value = new Date(dob);
  if (Number.isNaN(value.getTime())) return "";
  const now = new Date();
  let years = now.getFullYear() - value.getFullYear();
  const beforeBirthday =
    now.getMonth() < value.getMonth() ||
    (now.getMonth() === value.getMonth() && now.getDate() < value.getDate());
  if (beforeBirthday) years -= 1;
  return String(Math.max(years, 0));
}

function calcAgeInYearsAndMonths(dob) {
  if (!dob) return "";
  const value = new Date(dob);
  if (Number.isNaN(value.getTime())) return "";
  const now = new Date();
  if (value > now) return "";

  let years = now.getFullYear() - value.getFullYear();
  let months = now.getMonth() - value.getMonth();
  if (now.getDate() < value.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  years = Math.max(years, 0);
  months = Math.max(months, 0);
  return `${years} Years ${months} Months`;
}

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFacilityLinkKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function splitFacilityLinkValues(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue
      .flatMap((item) => splitFacilityLinkValues(item))
      .filter(Boolean);
  }
  return String(rawValue || "")
    .split(/[\n,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getFacilityAccountDisplayValue(row) {
  return String(
    row?.name ||
      row?.basic_information?.accountName ||
      row?.facility_name ||
      row?.facilityName ||
      ""
  ).trim();
}

function findFacilityAccountRecord(facilityName = "") {
  const needle = normalizeFacilityLinkKey(facilityName);
  if (!needle) return null;

  return (
    (Array.isArray(facilityData?.accounts) ? facilityData.accounts : []).find((row) => {
      const candidates = [
        row?.id,
        row?.account_code,
        row?.name,
        row?.basic_information?.accountName,
        row?.facility_name,
        row?.facilityName,
      ];
      return candidates.some((item) => normalizeFacilityLinkKey(item) === needle);
    }) || null
  );
}

function getFacilitySelectionKeys(facilityName = "") {
  const selectedFacility = String(facilityName || "").trim();
  const keys = new Set();
  if (!selectedFacility) return keys;

  const matchedAccount = findFacilityAccountRecord(selectedFacility);

  if (!matchedAccount) return keys;

  keys.add(normalizeFacilityLinkKey(selectedFacility));

  [
    matchedAccount?.id,
    matchedAccount?.account_code,
    matchedAccount?.name,
    matchedAccount?.basic_information?.accountName,
    matchedAccount?.facility_name,
    matchedAccount?.facilityName,
  ]
    .map((value) => normalizeFacilityLinkKey(value))
    .filter(Boolean)
    .forEach((value) => keys.add(value));

  return keys;
}

function getProviderFacilityLinkKeys(providerRow) {
  const keys = new Set();
  [
    providerRow?.account,
    providerRow?.accounts,
    providerRow?.provider_configuration?.accounts,
    providerRow?.provider_information?.accounts,
  ]
    .flatMap((value) => splitFacilityLinkValues(value))
    .map((value) => normalizeFacilityLinkKey(value))
    .filter(Boolean)
    .forEach((value) => keys.add(value));
  return keys;
}

function providerBelongsToFacility(providerRow, facilityName = "") {
  const facilityKeys = getFacilitySelectionKeys(facilityName);
  if (!facilityKeys.size) return true;

  const providerKeys = getProviderFacilityLinkKeys(providerRow);
  if (!providerKeys.size) return false;

  return [...providerKeys].some((value) => facilityKeys.has(value));
}

function getFacilityAccountOptions() {
  const seen = new Set();
  const options = [];
  const accounts = Array.isArray(facilityData?.accounts) ? facilityData.accounts : [];
  accounts.forEach((row) => {
    const candidate = getFacilityAccountDisplayValue(row);
    if (!candidate) return;
    const key = candidate.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    options.push(candidate);
  });
  return options.sort((a, b) => a.localeCompare(b));
}

function buildFacilityAccountOptionMarkup(selectedValue = "") {
  const selected = String(selectedValue || "").trim();
  const options = getFacilityAccountOptions();
  const optionMarkup = options
    .map((name) => `<option value="${escapeHtml(name)}"${name === selected ? " selected" : ""}>${escapeHtml(name)}</option>`)
    .join("");
  const includeSelectedFallback = selected && !options.some((name) => name === selected);
  return `
    <option value="">Select Facility</option>
    ${optionMarkup}
    ${includeSelectedFallback ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>` : ""}
  `;
}

function getFacilityProviderOptions(facilityName = "") {
  const seen = new Set();
  const options = [];
  const selectedFacility = String(facilityName || "").trim();
  const facilityKeys = getFacilitySelectionKeys(selectedFacility);
  const providers = Array.isArray(facilityData?.providers) ? facilityData.providers : [];
  providers.forEach((row) => {
    const providerName = String(
      row?.validator_name ||
        row?.provider_name ||
        row?.display_name ||
        row?.provider_information?.providerName ||
        ""
    ).trim();
    if (!providerName) return;
    const npi = String(row?.npi || row?.provider_information?.npi || "").trim();
    const key = `${providerName.toLowerCase()}|${npi.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    const providerKeys = getProviderFacilityLinkKeys(row);
    const isLinked = facilityKeys.size
      ? [...providerKeys].some((value) => facilityKeys.has(value))
      : false;
    options.push({
      value: providerName,
      label: npi ? `${providerName} | ${npi}` : providerName,
      npi,
      isLinked,
    });
  });
  return options.sort((a, b) => {
    if (a.isLinked !== b.isLinked) return a.isLinked ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

function buildFacilityProviderOptionMarkup(selectedValue = "", facilityName = "") {
  const selected = String(selectedValue || "").trim();
  const selectedFacility = String(facilityName || "").trim();
  const options = getFacilityProviderOptions(selectedFacility);
  const optionMarkup = options
    .map(
      (item) =>
        `<option value="${escapeHtml(item.value)}" data-provider-npi="${escapeHtml(item.npi || "")}" data-provider-label="${escapeHtml(item.label)}" data-provider-name="${escapeHtml(item.value)}"${item.value === selected ? " selected" : ""}>${escapeHtml(item.label)}</option>`
    )
    .join("");
  const includeSelectedFallback = !selectedFacility && selected && !options.some((item) => item.value === selected);
  return `
    <option value="">Select Provider</option>
    ${optionMarkup}
    ${includeSelectedFallback ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>` : ""}
  `;
}


function renderOrderPatient(patient) {
  const fullName = `${patient.firstName || ""} ${patient.middleName || ""} ${patient.lastName || ""}`.replace(/\s+/g, " ").trim() || "Patient";
  const age = patient.age || calcAge(patient.dob) || "0";
  const ageLabel = /\b(year|month)s?\b/i.test(String(age || "")) ? String(age) : `${age} years`;
  const sex = (patient.sex || "U").charAt(0).toUpperCase();
  const sampleTime = nowDateTimeLocal();

  panelBody.innerHTML = `
    <section class="order-page">
      <header class="order-header">
        <button type="button" id="order-back" class="btn-link">◁ Back</button>
        <h3>Order Patient</h3>
        <div class="order-time-row">
          <label>Sample Collect Time: <input id="sample-collect-time" type="datetime-local" value="${sampleTime}"></label>
          <label>Order Booking Time: <input id="order-booking-time" type="datetime-local" value="${sampleTime}"></label>
        </div>
        <button type="button" id="order-close" class="order-close">×</button>
      </header>

      <div class="order-layout">
        <aside class="order-patient-pane">
          <h4>${fullName} (${sex} - ${ageLabel})</h4>
          <p>#${patient.patientId || "Auto"}</p>
          <dl>
            <dt>Contact No</dt><dd>${patient.phone || "-"}</dd>
            <dt>Provider</dt><dd>${patient.provider || "-"}</dd>
            <dt>Facility Name</dt><dd>${patient.facilityName || "-"}</dd>
          </dl>
        </aside>

        <section class="order-main-pane">
          <label class="order-label">Select Source of Ordering</label>
          <div class="order-source-row">
            <button type="button" class="order-pill active">None (Default)</button>
            <button type="button" class="order-pill">Direct Walk in</button>
            <button type="button" class="order-pill">CORPORATE (CC)</button>
            <select><option>None (Default)</option></select>
          </div>

          <label class="order-label">Select Order ICD Code</label>
          <input id="selected-icd-summary" placeholder="Select Order ICD Code" readonly>

          <div class="order-service-card">
            <div class="order-service-head">
              <span>#</span>
              <span>Service Name</span>
              <span>ICD Code</span>
              <span>Price</span>
              <span>Concession</span>
            </div>
            <div id="order-service-rows"></div>
            <button type="button" id="order-add-service" class="order-add-service">Add Service</button>
          </div>
        </section>

        <aside class="order-price-pane">
          <h4>Price List Details</h4>
          <label>Provider Price List
            <select><option>SELF</option></select>
          </label>
          <label>Discount Price List
            <select><option>Search & Select List</option></select>
          </label>
        </aside>
      </div>

      <footer class="order-footer">
        <label class="order-check"><input type="checkbox"> STAT Sample</label>
        <div class="order-footer-actions">
          <button type="button" id="order-cancel" class="btn-ghost">Cancel</button>
          <button type="button" class="btn-primary order-mid-btn">AOE Complete</button>
          <button type="button" class="btn-primary order-confirm-btn">Confirm and Order</button>
        </div>
      </footer>
    </section>

    <div id="custom-icd-modal" class="custom-icd-modal hidden" role="dialog" aria-modal="true" aria-labelledby="custom-icd-title">
      <div class="custom-icd-dialog">
        <div class="custom-icd-head">
          <div>
            <p class="badge">ICD Catalog</p>
            <h3 id="custom-icd-title">Add Custom ICD Code</h3>
          </div>
          <button type="button" class="custom-icd-close" data-custom-icd-cancel aria-label="Close">×</button>
        </div>
        <form id="custom-icd-form" class="custom-icd-body" novalidate>
          <p class="subtle custom-icd-copy">This code is not in the current ICD catalog yet. Add a description to save it and use it for this order.</p>
          <div class="custom-icd-code-card">
            <span class="custom-icd-code-label">Code</span>
            <strong id="custom-icd-code-value" class="custom-icd-code-value"></strong>
          </div>
          <label class="custom-icd-field">
            <span>Description</span>
            <textarea id="custom-icd-description" rows="3" placeholder="Enter ICD description"></textarea>
          </label>
          <p id="custom-icd-error" class="error hidden" aria-live="polite"></p>
          <div class="custom-icd-footer">
            <button type="button" class="btn-ghost" data-custom-icd-cancel>Cancel</button>
            <button type="submit" class="btn-primary">Save ICD Code</button>
          </div>
        </form>
      </div>
    </div>
  `;

  function backToRegistration() {
    requisitionSubtab = "create";
    renderRegistration(patient);
  }

  const selectedIcdSummary = document.getElementById("selected-icd-summary");
  const orderPageNode = panelBody.querySelector(".order-page");
  const orderServiceRowsNode = document.getElementById("order-service-rows");
  const addServiceBtn = document.getElementById("order-add-service");
  const customIcdModalNode = document.getElementById("custom-icd-modal");
  const customIcdForm = document.getElementById("custom-icd-form");
  const customIcdCodeValueNode = document.getElementById("custom-icd-code-value");
  const customIcdDescriptionInput = document.getElementById("custom-icd-description");
  const customIcdErrorNode = document.getElementById("custom-icd-error");
  const orderState = {
    rows: [],
    openPicker: null,
  };
  let activeCustomIcdResolver = null;

  function createServiceRow(id) {
    const row = {
      id,
      panels: new Set(),
      icds: new Set(),
      panelQuery: "",
      icdQuery: "",
      price: 0,
      concession: 0,
    };
    return row;
  }

  function getPanelMappedIcdCodesForRow(row) {
    const codes = new Set();
    orderPanelCatalog
      .filter((panel) => row.panels.has(panel.id))
      .forEach((panel) => {
        normalizeIcdCodeList(Array.isArray(panel.icdCodes) ? panel.icdCodes : [])
          .forEach((code) => codes.add(code));
      });
    return codes;
  }

  function getAvailableIcdsForRow(row) {
    const mappedCodes = getPanelMappedIcdCodesForRow(row);
    const query = String(row?.icdQuery || "").trim();
    const catalogRows = getAllIcdCatalogRecords();
    const rows = query
      ? catalogRows.filter((item) => matchesIcdSearch(item, query))
      : catalogRows;

    return rows
      .slice()
      .sort((left, right) => {
        const leftMapped = mappedCodes.has(left.code) ? 0 : 1;
        const rightMapped = mappedCodes.has(right.code) ? 0 : 1;
        if (leftMapped !== rightMapped) return leftMapped - rightMapped;
        return compareIcdCodes(left.code, right.code);
      });
  }

  function updateRowComputedValues(row) {
    const panelItems = orderPanelCatalog.filter((panel) => row.panels.has(panel.id));
    row.price = panelItems.reduce((sum, panel) => sum + panel.price, 0);
  }

  function updateOrderSummary() {
    const allIcds = new Set();
    orderState.rows.forEach((row) => row.icds.forEach((code) => allIcds.add(code)));
    selectedIcdSummary.value = formatIcdCodesForDisplay(Array.from(allIcds).sort(compareIcdCodes));
  }

  function pruneIcdSelectionForRow(row) {
    Array.from(row.icds).forEach((code) => {
      if (!getIcdCatalogRecord(code)) row.icds.delete(code);
    });
  }

  function renderPanelOptions(row) {
    const q = row.panelQuery.trim().toLowerCase();
    const rows = orderPanelCatalog.filter((panel) => {
      if (!q) return true;
      return `${panel.name} ${panel.alias}`.toLowerCase().includes(q);
    });

    if (!rows.length) return `<p class="picker-empty">No matching panels.</p>`;

    return rows
      .map((panel) => {
        const checked = row.panels.has(panel.id) ? "checked" : "";
        return `
          <label class="picker-option">
            <input type="radio" name="panel-row-${row.id}" data-row-id="${row.id}" data-panel-id="${panel.id}" ${checked}>
            <div class="picker-option-text">
              <strong>${panel.name}</strong>
              <p>(${panel.alias})</p>
              <p>Price:$ ${panel.price}</p>
            </div>
          </label>
        `;
      })
      .join("");
  }

  function renderIcdOptions(row) {
    const rows = getAvailableIcdsForRow(row);
    const mappedCodes = getPanelMappedIcdCodesForRow(row);
    const exactQueryCode = normalizeIcdCode(row.icdQuery || "");
    const canOfferCustomAdd = isLikelyCustomIcdCode(exactQueryCode) && !getIcdCatalogRecord(exactQueryCode);
    if (!rows.length) {
      return `
        <p class="picker-empty">No ICD codes found in the registry.</p>
        ${
          canOfferCustomAdd
            ? `
              <button type="button" class="picker-custom-add-btn" data-row-id="${row.id}" data-add-custom-icd="${escapeHtml(exactQueryCode)}">
                <span class="picker-custom-add-badge">New</span>
                <strong>Add custom ICD code ${escapeHtml(formatIcdCode(exactQueryCode))}</strong>
                <span>Save this code to the ICD catalog and use it for this order.</span>
              </button>
            `
            : ""
        }
      `;
    }

    const visibleRows = rows.slice(0, 50);
    const overflowMarkup = rows.length > visibleRows.length
      ? `<p class="picker-empty">Showing ${visibleRows.length} of ${rows.length} ICD codes. Type to narrow the registry.</p>`
      : (row.panels.size
        ? '<p class="picker-empty">Panel-mapped ICD codes are shown first; search can find any registry ICD code.</p>'
        : "");

    return `${overflowMarkup}${visibleRows
      .map((icd) => {
        const checked = row.icds.has(icd.code) ? "checked" : "";
        const mappedBadge = mappedCodes.has(icd.code) ? '<span class="picker-option-badge">Panel</span>' : "";
        return `
          <label class="picker-option">
            <input type="checkbox" data-row-id="${row.id}" data-icd-code="${icd.code}" ${checked}>
            <div class="picker-option-text">
              <strong>${icd.formattedCode || formatIcdCode(icd.code)}${mappedBadge}</strong>
              <p>${icd.description}</p>
            </div>
          </label>
        `;
      })
      .join("")}${
        canOfferCustomAdd
          ? `
            <button type="button" class="picker-custom-add-btn" data-row-id="${row.id}" data-add-custom-icd="${escapeHtml(exactQueryCode)}">
              <span class="picker-custom-add-badge">New</span>
              <strong>Add custom ICD code ${escapeHtml(formatIcdCode(exactQueryCode))}</strong>
              <span>Save this code to the ICD catalog and use it for this order.</span>
            </button>
          `
          : ""
      }`;
  }

  function focusPickerSearchInput(rowId, type) {
    requestAnimationFrame(() => {
      const input = orderServiceRowsNode?.querySelector(
        `input[data-row-id="${rowId}"][data-picker-search="${type}"]`
      );
      if (!input) return;
      input.focus();
      const end = input.value.length;
      try {
        input.setSelectionRange(end, end);
      } catch {
        // Some browsers may not support selection range for all input modes.
      }
    });
  }

  function resolveRowIcdCodeFromInput(row, input) {
    const token = String(input || "").trim();
    if (!token) return "";
    const normalizedToken = normalizeIcdCode(token);

    const availableIcds = getAvailableIcdsForRow(row);
    const exactMatch = availableIcds.find((item) => item.code === normalizedToken);
    if (exactMatch) return exactMatch.code;

    const prefixMatches = availableIcds.filter((item) =>
      normalizedToken && item.code.startsWith(normalizedToken)
    );
    if (prefixMatches.length === 1) return prefixMatches[0].code;

    const fuzzyMatches = availableIcds.filter((item) => matchesIcdSearch(item, token));
    return fuzzyMatches.length === 1 ? fuzzyMatches[0].code : "";
  }

  function isLikelyCustomIcdCode(value) {
    return isLikelyIcdCode(value);
  }

  function registerCustomIcdCode(code, description, options = {}) {
    const mapToAllPanels = Boolean(options.mapToAllPanels);
    const nextIcdRecord = sanitizeIcdCatalogRecord({ code, description });
    if (!nextIcdRecord) return null;

    const existing = getIcdCatalogRecord(nextIcdRecord.code);
    if (existing) return existing;

    customIcdCatalog.push(nextIcdRecord);
    customIcdCatalog.sort((left, right) => compareIcdCodes(left.code, right.code));
    rebuildIcdCatalogState();
    saveMasterRegistryState();
    if (mapToAllPanels) {
      addIcdCodeToAllPanels(nextIcdRecord.code, { persist: true });
    }
    return getIcdCatalogRecord(nextIcdRecord.code);
  }

  function setCustomIcdModalError(message) {
    if (!customIcdErrorNode) return;
    const text = String(message || "").trim();
    customIcdErrorNode.textContent = text;
    customIcdErrorNode.classList.toggle("hidden", !text);
  }

  function closeCustomIcdModal(result = "") {
    if (!activeCustomIcdResolver) return;
    const resolve = activeCustomIcdResolver;
    activeCustomIcdResolver = null;
    customIcdModalNode?.classList.add("hidden");
    document.body.classList.remove("modal-open");
    setCustomIcdModalError("");
    if (customIcdDescriptionInput) customIcdDescriptionInput.value = "";
    resolve(result);
  }

  function openCustomIcdModal(code) {
    if (!customIcdModalNode || !customIcdDescriptionInput || !customIcdCodeValueNode) {
      return Promise.resolve("");
    }

    if (activeCustomIcdResolver) {
      closeCustomIcdModal("");
    }

    customIcdCodeValueNode.textContent = formatIcdCode(code);
    customIcdDescriptionInput.value = "";
    setCustomIcdModalError("");
    customIcdModalNode.classList.remove("hidden");
    document.body.classList.add("modal-open");

    return new Promise((resolve) => {
      activeCustomIcdResolver = resolve;
      requestAnimationFrame(() => {
        customIcdDescriptionInput.focus();
        customIcdDescriptionInput.select();
      });
    });
  }

  async function promptForCustomIcdCode(rawCode) {
    const normalizedCode = normalizeIcdCode(rawCode);
    if (!normalizedCode) return "";
    if (!isLikelyCustomIcdCode(normalizedCode)) return "";

    const existing = getIcdCatalogRecord(normalizedCode);
    if (existing?.code) return existing.code;

    const description = await openCustomIcdModal(normalizedCode);
    const trimmedDescription = String(description || "").trim();
    if (!trimmedDescription) {
      return "";
    }

    const created = registerCustomIcdCode(normalizedCode, trimmedDescription);
    if (!created?.code) {
      alert("Unable to add custom ICD code.");
      return "";
    }
    return created.code;
  }

  async function applyTypedIcdCodes(row, rawInput) {
    const tokens = String(rawInput || "")
      .split(/[\n,;]+/)
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (!tokens.length) return false;

    let added = false;
    const unresolved = [];
    for (const token of tokens) {
      let resolvedCode = resolveRowIcdCodeFromInput(row, token);
      if (!resolvedCode) {
        resolvedCode = await promptForCustomIcdCode(token);
      }
      if (resolvedCode) {
        row.icds.add(resolvedCode);
        added = true;
      } else {
        unresolved.push(token);
      }
    }

    row.icdQuery = unresolved.join(", ");
    return added;
  }

  function renderServiceRows() {
    orderServiceRowsNode.innerHTML = orderState.rows
      .map((row, index) => {
        updateRowComputedValues(row);
        const panelNames = orderPanelCatalog
          .filter((panel) => row.panels.has(panel.id))
          .map((panel) => panel.name)
          .join(", ");
        const icdCodes = formatIcdCodesForDisplay(Array.from(row.icds).sort(compareIcdCodes));
        const panelOpen = orderState.openPicker && orderState.openPicker.rowId === row.id && orderState.openPicker.type === "panel";
        const icdOpen = orderState.openPicker && orderState.openPicker.rowId === row.id && orderState.openPicker.type === "icd";

        return `
          <div class="order-service-row" data-row-id="${row.id}">
            <span>${index + 1}</span>
            <div class="picker order-picker">
              <div class="picker-input-wrap">
                <input class="service-name-field" data-row-id="${row.id}" placeholder="Search & Select List" value="${panelNames}" readonly>
                <button type="button" class="picker-icon-btn" data-row-id="${row.id}" data-open-picker="panel">⌕</button>
              </div>
              <div class="picker-dropdown ${panelOpen ? "is-open" : ""}" role="listbox" aria-label="Panel list">
                <div class="picker-search-wrap">
                  <input data-row-id="${row.id}" data-picker-search="panel" placeholder="Search panels" value="${row.panelQuery}">
                </div>
                <div class="picker-options">${renderPanelOptions(row)}</div>
              </div>
            </div>
            <div class="picker order-picker">
              <div class="picker-input-wrap">
                <input class="service-icd-field" data-row-id="${row.id}" placeholder="ICD Code" value="${icdCodes}" readonly>
                <button type="button" class="picker-icon-btn" data-row-id="${row.id}" data-open-picker="icd">⌕</button>
              </div>
              <div class="picker-dropdown ${icdOpen ? "is-open" : ""}" role="listbox" aria-label="ICD list">
                <div class="picker-search-wrap">
                  <input data-row-id="${row.id}" data-picker-search="icd" placeholder="Type ICD code or search description, then press Enter" value="${row.icdQuery}">
                </div>
                <p class="subtle picker-empty">Type an exact ICD code and press Enter to add it quickly.</p>
                <div class="picker-options">${renderIcdOptions(row)}</div>
              </div>
            </div>
            <input data-row-id="${row.id}" data-price-input value="${row.price}">
            <input data-row-id="${row.id}" data-concession-input value="${row.concession}">
          </div>
        `;
      })
      .join("");
    updateOrderSummary();
  }

  function getActiveOrderSource() {
    const active = orderPageNode?.querySelector(".order-pill.active");
    return active ? active.textContent.trim() : "None (Default)";
  }

  async function commitOrder() {
    const sampleCollectTime = document.getElementById("sample-collect-time")?.value || "";
    const orderBookingTime = document.getElementById("order-booking-time")?.value || "";
    const preparedRows = orderState.rows
      .map((row, index) => {
        const panelItems = orderPanelCatalog.filter((panel) => row.panels.has(panel.id));
        const serviceName = panelItems.map((panel) => panel.name).join(", ");
        const icdCodes = Array.from(row.icds).sort(compareIcdCodes);
        const price = Number(row.price) || 0;
        const concession = Number(row.concession) || 0;
        return {
          lineNo: index + 1,
          serviceName,
          panelIds: panelItems.map((panel) => panel.id),
          icdCodes,
          price,
          concession,
          due: Math.max(price - concession, 0),
        };
      })
      .filter((row) => row.serviceName);

    if (!preparedRows.length) {
      alert("Please select at least one service before confirming the order.");
      return;
    }

    const commonFields = {
      patientId: patient.patientId || "",
      patientName: fullName,
      patientDob: patient.dob || "",
      provider: patient.provider || "",
      facilityName: patient.facilityName || "",
      orderSource: getActiveOrderSource(),
      sampleCollectTime,
      orderBookingTime,
      status: "Pending",
    };

    let reservedOrderIds = [];
    try {
      reservedOrderIds = await allocateOrderIds(preparedRows.length);
    } catch (error) {
      alert(error?.message || "Unable to reserve order IDs.");
      return;
    }
    if (reservedOrderIds.length !== preparedRows.length || reservedOrderIds.some((value) => !String(value || "").trim())) {
      alert("Unable to reserve order IDs.");
      return;
    }

    const nextOrderRecords = preparedRows.map((serviceRow, index) => {
      const orderId = String(reservedOrderIds[index] || "").trim();
      return {
        orderId,
        accessionPrefix: resolvePanelPrefixFromService(serviceRow),
        ...commonFields,
        services: [serviceRow],
        amount: serviceRow.price,
        concession: serviceRow.concession,
        due: serviceRow.due,
      };
    });
    try {
      await saveOrderRecords(nextOrderRecords);
      currentView = "order-history";
      renderNav();
      renderView();
    } catch (error) {
      alert(error?.message || "Unable to save order.");
    }
  }

  orderState.rows = [createServiceRow(1)];
  renderServiceRows();

  addServiceBtn?.addEventListener("click", () => {
    const nextId = orderState.rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
    orderState.rows.push(createServiceRow(nextId));
    renderServiceRows();
  });

  orderServiceRowsNode.addEventListener("click", (event) => {
    const pickerBtn = event.target.closest("[data-open-picker]");
    if (pickerBtn) {
      const rowId = Number(pickerBtn.getAttribute("data-row-id"));
      const type = pickerBtn.getAttribute("data-open-picker");
      if (!rowId || !type) return;
      if (orderState.openPicker && orderState.openPicker.rowId === rowId && orderState.openPicker.type === type) {
        orderState.openPicker = null;
      } else {
        orderState.openPicker = { rowId, type };
      }
      renderServiceRows();
      if (orderState.openPicker) focusPickerSearchInput(rowId, type);
      return;
    }

    const displayField = event.target.closest(".service-name-field, .service-icd-field");
    if (displayField) {
      const rowId = Number(displayField.getAttribute("data-row-id"));
      const type = displayField.classList.contains("service-name-field") ? "panel" : "icd";
      orderState.openPicker = { rowId, type };
      renderServiceRows();
      focusPickerSearchInput(rowId, type);
      return;
    }

    const panelCheck = event.target.closest("input[data-panel-id]");
    if (panelCheck) {
      const rowId = Number(panelCheck.getAttribute("data-row-id"));
      const panelId = panelCheck.getAttribute("data-panel-id");
      const row = orderState.rows.find((item) => item.id === rowId);
      if (!row || !panelId) return;
      row.panels.clear();
      if (panelCheck.checked) row.panels.add(panelId);
      pruneIcdSelectionForRow(row);
      updateRowComputedValues(row);
      renderServiceRows();
      return;
    }

    const icdCheck = event.target.closest("input[data-icd-code]");
    if (icdCheck) {
      const rowId = Number(icdCheck.getAttribute("data-row-id"));
      const code = icdCheck.getAttribute("data-icd-code");
      const row = orderState.rows.find((item) => item.id === rowId);
      if (!row || !code) return;
      if (icdCheck.checked) row.icds.add(code);
      else row.icds.delete(code);
      renderServiceRows();
    }

    const customIcdBtn = event.target.closest("[data-add-custom-icd]");
    if (customIcdBtn) {
      const rowId = Number(customIcdBtn.getAttribute("data-row-id"));
      const row = orderState.rows.find((item) => item.id === rowId);
      const rawCode = customIcdBtn.getAttribute("data-add-custom-icd");
      if (!row || !rawCode) return;
      (async () => {
        const createdCode = await promptForCustomIcdCode(rawCode);
        if (createdCode) {
          row.icds.add(createdCode);
          row.icdQuery = "";
        }
        renderServiceRows();
        focusPickerSearchInput(rowId, "icd");
      })();
      return;
    }
  });

  customIcdModalNode?.addEventListener("click", (event) => {
    if (event.target === customIcdModalNode || event.target.closest("[data-custom-icd-cancel]")) {
      closeCustomIcdModal("");
    }
  });

  customIcdModalNode?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCustomIcdModal("");
    }
  });

  customIcdForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const description = String(customIcdDescriptionInput?.value || "").trim();
    if (!description) {
      setCustomIcdModalError("Description is required.");
      customIcdDescriptionInput?.focus();
      return;
    }
    closeCustomIcdModal(description);
  });

  orderServiceRowsNode.addEventListener("input", (event) => {
    const rowId = Number(event.target.getAttribute("data-row-id"));
    const row = orderState.rows.find((item) => item.id === rowId);
    if (!row) return;

    if (event.target.matches("[data-picker-search='panel']")) {
      row.panelQuery = event.target.value;
      renderServiceRows();
      focusPickerSearchInput(rowId, "panel");
      return;
    }
    if (event.target.matches("[data-picker-search='icd']")) {
      row.icdQuery = event.target.value;
      renderServiceRows();
      focusPickerSearchInput(rowId, "icd");
      return;
    }
    if (event.target.matches("[data-price-input]")) {
      row.price = Number(event.target.value) || 0;
      updateOrderSummary();
      return;
    }
    if (event.target.matches("[data-concession-input]")) {
      row.concession = Number(event.target.value) || 0;
      updateOrderSummary();
    }
  });

  orderServiceRowsNode.addEventListener("keydown", async (event) => {
    if (!event.target.matches("[data-picker-search='icd']")) return;
    if (event.key !== "Enter") return;

    const rowId = Number(event.target.getAttribute("data-row-id"));
    const row = orderState.rows.find((item) => item.id === rowId);
    if (!row) return;

    event.preventDefault();
    await applyTypedIcdCodes(row, event.target.value);
    renderServiceRows();
    focusPickerSearchInput(rowId, "icd");
  });

  orderPageNode?.addEventListener("click", (event) => {
    if (event.target.closest(".order-picker")) return;
    orderState.openPicker = null;
    renderServiceRows();
  });

  orderPageNode?.querySelectorAll(".order-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      orderPageNode.querySelectorAll(".order-pill").forEach((node) => node.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  document.getElementById("order-back")?.addEventListener("click", backToRegistration);
  document.getElementById("order-close")?.addEventListener("click", backToRegistration);
  document.getElementById("order-cancel")?.addEventListener("click", backToRegistration);
  document.querySelector(".order-confirm-btn")?.addEventListener("click", commitOrder);
}

function renderPatientSearch() {
  const canEditPatients = activeSession.type === "doctor";

  panelBody.innerHTML = `
    <section class="patient-search-card">
      <div class="patient-search-grid">
        <label>
          <span>Patient Name</span>
          <div class="input-with-icon">
            <input name="searchName" placeholder="Enter Full Name">
            <span>⌕</span>
          </div>
        </label>
        <label>
          <span>Patient Contact</span>
          <div class="input-with-icon">
            <input name="searchContact" placeholder="Enter Contact">
            <span>⌕</span>
          </div>
        </label>
        <label>
          <span>Patient DOB</span>
          <input type="date" name="searchDob" placeholder="Select Date of Birth MM/DD/YYYY">
        </label>
        <div class="patient-search-actions">
          <button type="button" id="patient-search-btn" class="btn-primary">Search</button>
          <button type="button" id="patient-search-more" class="btn-link">Show More ↓</button>
        </div>
      </div>

      <div id="patient-search-more-panel" class="patient-search-more hidden">
        <div class="patient-search-grid two-up">
          <label><span>MRN</span><input name="searchMrn" placeholder="Enter MRN"></label>
          <label><span>Patient ID</span><input name="searchPatientId" placeholder="Enter Patient ID"></label>
        </div>
      </div>

      <p id="patient-search-feedback" class="patient-search-feedback subtle hidden"></p>
      <div id="patient-search-results" class="patient-search-results hidden"></div>
    </section>
    ${
      canEditPatients
        ? `
          <div id="patient-edit-modal" class="custom-icd-modal hidden" role="dialog" aria-modal="true" aria-labelledby="patient-edit-title">
            <div class="custom-icd-dialog patient-edit-dialog">
              <div class="custom-icd-head">
                <div>
                  <p class="badge">Patient Search</p>
                  <h3 id="patient-edit-title">Edit Patient Record</h3>
                </div>
                <button type="button" class="custom-icd-close" data-patient-edit-close aria-label="Close">×</button>
              </div>
              <form id="patient-edit-form" class="custom-icd-body patient-edit-body" novalidate>
                <div class="patient-edit-scroll">
                  <p class="subtle custom-icd-copy">Update the stored patient details below. Changes are written back to LabCenter storage and reflected in Patient Search right away.</p>
                  <div class="patient-edit-summary">
                    <div>
                      <span>Patient ID</span>
                      <strong id="patient-edit-id">-</strong>
                    </div>
                    <div>
                      <span>Record</span>
                      <strong id="patient-edit-name">Patient</strong>
                    </div>
                  </div>

                  <section class="patient-edit-section">
                    <h4>Facility and Provider</h4>
                    <div class="field-grid two-col">
                      <label><span>Reference Lab</span><input name="referenceLab" placeholder="Reference Lab"></label>
                      <label><span>Facility</span><input name="facilityName" placeholder="Facility"></label>
                    </div>
                    <div class="field-grid two-col">
                      <label><span>Provider</span><input name="provider" placeholder="Provider"></label>
                      <label><span>Provider NPI</span><input name="providerNpi" placeholder="Provider NPI"></label>
                    </div>
                  </section>

                  <section class="patient-edit-section">
                  <h4>Patient Information</h4>
                  <div class="field-grid three-col">
                    <label><span>First Name</span><input name="firstName" placeholder="First Name"></label>
                    <label><span>Middle Name</span><input name="middleName" placeholder="Middle Name"></label>
                    <label><span>Last Name</span><input name="lastName" placeholder="Last Name"></label>
                  </div>
                  <div class="field-grid four-col">
                    <label><span>Suffix</span><input name="suffix" placeholder="Suffix"></label>
                    <label><span>Date of Birth</span><input type="date" name="dob"></label>
                    <label><span>Sex</span>
                      <select name="sex">
                        <option value="">Select Sex</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </label>
                    <label><span>Age</span><input type="text" name="age" placeholder="Age" readonly></label>
                  </div>
                  <div class="field-grid three-col">
                    <label><span>MRN</span><input name="mrn" placeholder="MRN"></label>
                    <label><span>Contact Number</span><input name="phone" placeholder="Contact Number"></label>
                    <label><span>Email</span><input type="email" name="email" placeholder="Email"></label>
                  </div>
                  <div class="field-grid two-col">
                    <label><span>Phone Belongs To</span>
                      <select name="phoneBelongsTo">
                        <option value="Patient">Patient</option>
                        <option value="Relative/Guardian">Relative/Guardian</option>
                      </select>
                    </label>
                    <label><span>Patient Type</span><input name="patientType" placeholder="Patient Type"></label>
                  </div>
                  <div class="field-grid two-col">
                    <label><span>Address 1</span><input name="address" placeholder="Address 1"></label>
                    <label><span>Address 2</span><input name="address2" placeholder="Address 2"></label>
                  </div>
                  <div class="field-grid three-col">
                    <label><span>City</span><input name="city" placeholder="City"></label>
                    <label><span>State</span><input name="state" placeholder="State"></label>
                    <label><span>Zip Code</span><input name="zipcode" placeholder="Zip Code"></label>
                  </div>
                  <div class="field-grid three-col">
                    <label><span>County</span><input name="county" placeholder="County"></label>
                    <label><span>Country</span><input name="country" placeholder="Country"></label>
                    <label><span>Ethnicity</span><input name="ethnicity" placeholder="Ethnicity"></label>
                  </div>
                  <div class="field-grid two-col">
                    <label><span>Race</span><input name="race" placeholder="Race"></label>
                    <label><span>Patient ID</span><input name="patientId" placeholder="Patient ID" readonly></label>
                  </div>
                  </section>

                  <section class="patient-edit-section">
                  <h4>Billing and Insurance</h4>
                  <div class="field-grid two-col">
                    <label><span>Billing Type</span>
                      <select name="billingType">
                        <option value="">Select Billing Type</option>
                        <option value="selfPay">Self Pay</option>
                        <option value="commercial">Commercial</option>
                        <option value="medicare">Medicare</option>
                        <option value="medicaid">Medicaid</option>
                        <option value="workersComp">Workers Comp</option>
                        <option value="clientBill">Client Bill</option>
                        <option value="uninsured">Uninsured</option>
                      </select>
                    </label>
                    <label><span>Insurance Phone #</span><input name="insurancePhone" placeholder="Insurance Phone #"></label>
                  </div>
                  <div class="field-grid two-col">
                    <label><span>Primary Insurance</span><input name="primaryInsurance" placeholder="Primary Insurance"></label>
                    <label><span>Primary Policy ID</span><input name="primaryMemberPolicy" placeholder="Primary Policy ID"></label>
                  </div>
                  <div class="field-grid three-col">
                    <label><span>Primary Group</span><input name="primaryGroup" placeholder="Primary Group"></label>
                    <label><span>Primary Group No</span><input name="primaryGroupNo" placeholder="Primary Group No"></label>
                    <label><span>Primary Attachments</span><input name="primaryAttachments" placeholder="Primary Attachments"></label>
                  </div>
                  <div class="field-grid two-col">
                    <label><span>Secondary Insurance</span><input name="secondaryInsurance" placeholder="Secondary Insurance"></label>
                    <label><span>Secondary Policy ID</span><input name="secondaryMemberPolicy" placeholder="Secondary Policy ID"></label>
                  </div>
                  <div class="field-grid three-col">
                    <label><span>Secondary Group</span><input name="secondaryGroup" placeholder="Secondary Group"></label>
                    <label><span>Secondary Group No</span><input name="secondaryGroupNo" placeholder="Secondary Group No"></label>
                    <label><span>Secondary Attachments</span><input name="secondaryAttachments" placeholder="Secondary Attachments"></label>
                  </div>
                  <div class="field-grid two-col">
                    <label><span>Tertiary Insurance</span><input name="tertiaryInsurance" placeholder="Tertiary Insurance"></label>
                    <label><span>Tertiary Policy ID</span><input name="tertiaryMemberPolicy" placeholder="Tertiary Policy ID"></label>
                  </div>
                  <div class="field-grid three-col">
                    <label><span>Tertiary Group</span><input name="tertiaryGroup" placeholder="Tertiary Group"></label>
                    <label><span>Tertiary Group No</span><input name="tertiaryGroupNo" placeholder="Tertiary Group No"></label>
                    <label><span>Tertiary Attachments</span><input name="tertiaryAttachments" placeholder="Tertiary Attachments"></label>
                  </div>
                  <div class="field-grid two-col">
                    <label><span>Workers Compensation</span><input name="workersCompensation" placeholder="Workers Compensation"></label>
                    <label><span>Workers Policy</span><input name="workersMemberPolicy" placeholder="Workers Policy"></label>
                  </div>
                  <div class="field-grid two-col">
                    <label><span>Compensation Manager</span><input name="compensationManager" placeholder="Compensation Manager"></label>
                    <label><span>Injury Date</span><input type="date" name="injuryDate"></label>
                  </div>
                  </section>

                  <section class="patient-edit-section">
                  <h4>Collection and Notes</h4>
                  <div class="field-grid three-col">
                    <label><span>Date Of Collection</span><input type="date" name="collectionDate"></label>
                    <label><span>Time Of Collection</span><input type="time" name="collectionTime"></label>
                    <label><span>Date Received</span><input type="date" name="receivedDate"></label>
                  </div>
                  <div class="field-grid one-col">
                    <label><span>Additional Information</span><textarea name="additionalInformation" rows="3" placeholder="Additional patient or billing notes"></textarea></label>
                  </div>
                  </section>
                </div>

                <p id="patient-edit-feedback" class="error hidden" aria-live="polite"></p>
                <div class="custom-icd-footer patient-edit-footer">
                  <button type="button" class="btn-ghost" data-patient-edit-close>Cancel</button>
                  <button type="submit" class="btn-primary" id="patient-edit-save">Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        `
        : ""
    }
  `;

  let allPatients = getSearchablePatients();
  const searchBtn = document.getElementById("patient-search-btn");
  const moreBtn = document.getElementById("patient-search-more");
  const morePanel = document.getElementById("patient-search-more-panel");
  const feedbackNode = document.getElementById("patient-search-feedback");
  const resultsNode = document.getElementById("patient-search-results");
  const patientEditModalNode = document.getElementById("patient-edit-modal");
  const patientEditForm = document.getElementById("patient-edit-form");
  const patientEditFeedbackNode = document.getElementById("patient-edit-feedback");
  const patientEditIdNode = document.getElementById("patient-edit-id");
  const patientEditNameNode = document.getElementById("patient-edit-name");
  const patientEditSaveBtn = document.getElementById("patient-edit-save");
  let baseResults = [];
  let sortField = "patientId";
  let sortDirection = "asc";
  let activeFilterField = "";
  let textFilterMenuOpen = false;
  let draft = null;
  let valueCache = [];
  let activePatientActionKey = "";
  let patientSaveInFlight = false;
  let patientLookup = new Map();
  const columnFilters = {
    patientId: { mode: "contains", term: "", selectedValues: null },
    name: { mode: "contains", term: "", selectedValues: null },
    contact: { mode: "contains", term: "", selectedValues: null },
    dob: { mode: "contains", term: "", selectedValues: null },
    mrn: { mode: "contains", term: "", selectedValues: null },
    provider: { mode: "contains", term: "", selectedValues: null },
  };

  function getName(patient) {
    return `${patient.firstName || ""} ${patient.middleName || ""} ${patient.lastName || ""}`
      .replace(/\s+/g, " ")
      .trim();
  }

  function getPatientKey(patient) {
    return String(patient?.__patientSearchKey || getPatientSearchRecordKey(patient) || "").trim();
  }

  function setFeedback(message, tone = "neutral") {
    if (!feedbackNode) return;
    const nextMessage = String(message || "").trim();
    feedbackNode.textContent = nextMessage;
    feedbackNode.classList.toggle("hidden", !nextMessage);
    feedbackNode.classList.toggle("error", tone === "error");
  }

  function setPatientEditFeedback(message = "") {
    if (!patientEditFeedbackNode) return;
    const nextMessage = String(message || "").trim();
    patientEditFeedbackNode.textContent = nextMessage;
    patientEditFeedbackNode.classList.toggle("hidden", !nextMessage);
  }

  function closeFilterPopover() {
    const pop = resultsNode.querySelector("#column-filter-popover");
    if (pop) pop.classList.add("hidden");
    activeFilterField = "";
    draft = null;
    textFilterMenuOpen = false;
  }

  function closePatientActionMenu() {
    const menu = resultsNode.querySelector("#patient-row-action-menu");
    if (menu) menu.classList.add("hidden");
    activePatientActionKey = "";
  }

  function openPatientActionMenu(patientKey, anchorButton) {
    const menu = resultsNode.querySelector("#patient-row-action-menu");
    if (!menu || !patientKey) return;
    menu.innerHTML = `
      <button type="button" class="patient-row-menu-btn" data-patient-action="edit" data-patient-key="${escapeHtml(patientKey)}">Edit</button>
    `;
    menu.classList.remove("hidden");
    activePatientActionKey = patientKey;

    const anchorRect = anchorButton.getBoundingClientRect();
    const menuWidth = 160;
    const viewportPadding = 8;
    const left = Math.max(
      viewportPadding,
      Math.min(anchorRect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding)
    );
    const top = anchorRect.bottom + 6;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function syncPatientEditAge() {
    if (!patientEditForm?.elements?.dob || !patientEditForm?.elements?.age) return;
    const nextAge = calcAgeInYearsAndMonths(patientEditForm.elements.dob.value);
    patientEditForm.elements.age.value = nextAge;
  }

  function populatePatientEditForm(patient) {
    if (!patientEditForm) return;
    const values = asPatientRecord(patient || {});
    const editableKeys = [
      "referenceLab",
      "facilityName",
      "provider",
      "providerNpi",
      "firstName",
      "middleName",
      "lastName",
      "suffix",
      "dob",
      "sex",
      "age",
      "mrn",
      "phone",
      "email",
      "phoneBelongsTo",
      "patientType",
      "address",
      "address2",
      "city",
      "state",
      "zipcode",
      "county",
      "country",
      "ethnicity",
      "race",
      "patientId",
      "billingType",
      "insurancePhone",
      "primaryInsurance",
      "primaryMemberPolicy",
      "primaryGroup",
      "primaryGroupNo",
      "primaryAttachments",
      "secondaryInsurance",
      "secondaryMemberPolicy",
      "secondaryGroup",
      "secondaryGroupNo",
      "secondaryAttachments",
      "tertiaryInsurance",
      "tertiaryMemberPolicy",
      "tertiaryGroup",
      "tertiaryGroupNo",
      "tertiaryAttachments",
      "workersCompensation",
      "workersMemberPolicy",
      "compensationManager",
      "injuryDate",
      "collectionDate",
      "collectionTime",
      "receivedDate",
      "additionalInformation",
    ];

    editableKeys.forEach((key) => {
      const field = patientEditForm.elements[key];
      if (!field) return;
      field.value = values[key] || "";
    });

    if (patientEditIdNode) patientEditIdNode.textContent = values.patientId || "-";
    if (patientEditNameNode) patientEditNameNode.textContent = getName(values) || values.patientId || "Patient";
    syncPatientEditAge();
  }

  function openPatientEditModal(patientKey) {
    if (!patientEditModalNode || !patientEditForm) return;
    const patient = patientLookup.get(patientKey);
    if (!patient) return;
    populatePatientEditForm(patient);
    setPatientEditFeedback("");
    patientEditModalNode.classList.remove("hidden");
    syncBodyModalOpenState();
    requestAnimationFrame(() => {
      const firstField = patientEditForm.querySelector("input, select, textarea, button");
      firstField?.focus();
    });
  }

  function closePatientEditModal() {
    if (!patientEditModalNode) return;
    patientEditModalNode.classList.add("hidden");
    patientSaveInFlight = false;
    if (patientEditSaveBtn) patientEditSaveBtn.disabled = false;
    setPatientEditFeedback("");
    syncBodyModalOpenState();
  }

  function collectPatientEditValues() {
    if (!patientEditForm) return {};
    const values = Object.fromEntries(new FormData(patientEditForm).entries());
    values.patientId = String(values.patientId || "").trim();
    values.age = calcAgeInYearsAndMonths(values.dob) || String(values.age || "").trim();
    return values;
  }

  function compareRows(a, b, field, direction) {
    const left = (() => {
      if (field === "name") return getName(a).toLowerCase();
      if (field === "contact") return String(a.phone || "");
      if (field === "dob") return a.dob || "";
      if (field === "mrn") return String(a.mrn || "").toLowerCase();
      if (field === "provider") return String(a.provider || "").toLowerCase();
      return String(a.patientId || "");
    })();
    const right = (() => {
      if (field === "name") return getName(b).toLowerCase();
      if (field === "contact") return String(b.phone || "");
      if (field === "dob") return b.dob || "";
      if (field === "mrn") return String(b.mrn || "").toLowerCase();
      if (field === "provider") return String(b.provider || "").toLowerCase();
      return String(b.patientId || "");
    })();

    if (left < right) return direction === "asc" ? -1 : 1;
    if (left > right) return direction === "asc" ? 1 : -1;
    return 0;
  }

  function getFieldValue(patient, field) {
    if (field === "name") return getName(patient);
    if (field === "contact") return String(patient.phone || "");
    if (field === "dob") return formatDateForCard(patient.dob);
    if (field === "mrn") return String(patient.mrn || "");
    if (field === "provider") return String(patient.provider || "");
    return String(patient.patientId || "");
  }

  function getFilteredSortedRows() {
    const rows = baseResults.filter((patient) => {
      const values = {
        patientId: String(patient.patientId || ""),
        name: getName(patient),
        contact: String(patient.phone || ""),
        dob: getFieldValue(patient, "dob"),
        mrn: String(patient.mrn || ""),
        provider: String(patient.provider || ""),
      };

      function passesFilter(field) {
        const cfg = columnFilters[field];
        const raw = values[field];
        const value = raw.toLowerCase();
        const term = cfg.term || "";
        const blankToken = "(Blanks)";
        const selected = cfg.selectedValues;
        if (selected !== null) {
          if (!selected.length) return false;
          const selectedSet = new Set(selected);
          const comparable = raw.trim() ? raw : blankToken;
          if (!selectedSet.has(comparable)) return false;
        }

        if (!term) return true;
        if (cfg.mode === "equals") return value === term;
        if (cfg.mode === "not_equals") return value !== term;
        if (cfg.mode === "begins_with") return value.startsWith(term);
        if (cfg.mode === "ends_with") return value.endsWith(term);
        if (cfg.mode === "not_contains") return !value.includes(term);
        return value.includes(term);
      }

      return (
        passesFilter("patientId") &&
        passesFilter("name") &&
        passesFilter("contact") &&
        passesFilter("dob") &&
        passesFilter("mrn") &&
        passesFilter("provider")
      );
    });
    return rows.sort((a, b) => compareRows(a, b, sortField, sortDirection));
  }

  function sortIndicator(field) {
    if (sortField !== field) return "↕";
    return sortDirection === "asc" ? "↑" : "↓";
  }

  function filterIndicator(field) {
    const cfg = columnFilters[field];
    if (cfg.term || cfg.selectedValues !== null) return "⏷*";
    return "⏷";
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function openFilterPopover(field, anchorButton) {
    const switchingField = activeFilterField !== field;
    activeFilterField = field;
    textFilterMenuOpen = false;
    const source = columnFilters[field];
    if (!draft || switchingField) {
      draft = {
        mode: source.mode,
        term: source.term,
        selectedValues: source.selectedValues === null ? null : [...source.selectedValues],
        valueSearch: "",
      };
    }
    const popover = resultsNode.querySelector("#column-filter-popover");
    if (!popover) return;

    valueCache = [...new Set(baseResults.map((patient) => getFieldValue(patient, field).trim() || "(Blanks)"))];
    const filteredValues = valueCache.filter((value) => value.toLowerCase().includes(draft.valueSearch.toLowerCase()));
    const selectedSet = new Set(draft.selectedValues || []);
    const isAllSelected = draft.selectedValues === null;
    const uniqueValues = filteredValues
      .slice(0, 25)
      .map((value, index) => {
        const checked = isAllSelected || selectedSet.has(value) ? "checked" : "";
        return `
          <label class="filter-check-row">
            <input type="checkbox" class="filter-value-check" data-value-index="${index}" ${checked}>
            <span>${escapeHtml(value)}</span>
          </label>
        `;
      })
      .join("");

    popover.innerHTML = `
      <button type="button" class="filter-menu-btn" data-sort="asc">Sort A to Z</button>
      <button type="button" class="filter-menu-btn" data-sort="desc">Sort Z to A</button>
      <div class="filter-divider"></div>
      <button type="button" class="filter-menu-btn ${source.term || source.selectedValues !== null ? "" : "muted"}" data-filter-clear>Clear Filter</button>
      <button type="button" class="filter-menu-btn" data-open-text-menu>Text Filters ▸</button>
      <div class="filter-divider"></div>
      <input id="filter-values-search" class="filter-popover-input" value="${escapeHtml(draft.valueSearch)}" placeholder="Search values">
      <label class="filter-check-row select-all-row">
        <input type="checkbox" id="filter-select-all" ${isAllSelected ? "checked" : ""}>
        <span>Select All</span>
      </label>
      <div class="filter-value-list">${uniqueValues || '<span class="subtle">No values</span>'}</div>
      <div class="filter-popover-actions">
        <button type="button" class="btn-ghost mini-btn" data-filter-cancel>Cancel</button>
        <button type="button" class="btn-primary mini-btn" data-filter-apply>Apply</button>
      </div>
      <div id="text-filter-menu" class="text-filter-menu ${textFilterMenuOpen ? "" : "hidden"}">
        <button type="button" class="text-filter-option" data-mode="equals">Equals...</button>
        <button type="button" class="text-filter-option" data-mode="not_equals">Does Not Equal...</button>
        <button type="button" class="text-filter-option" data-mode="begins_with">Begins With...</button>
        <button type="button" class="text-filter-option" data-mode="ends_with">Ends With...</button>
        <button type="button" class="text-filter-option" data-mode="contains">Contains...</button>
        <button type="button" class="text-filter-option" data-mode="not_contains">Does Not Contain...</button>
      </div>
      <div class="text-filter-inline">
        <span>${draft.mode.replace("_", " ").toUpperCase()}:</span>
        <input id="text-filter-term" class="filter-popover-input" value="${escapeHtml(draft.term)}" placeholder="Enter text condition">
      </div>
    `;
    popover.classList.remove("hidden");

    const anchorRect = anchorButton.getBoundingClientRect();
    const popoverWidth = 280;
    const estimatedHeight = 520;
    const viewportPadding = 8;
    let left = Math.max(
      viewportPadding,
      Math.min(anchorRect.left, window.innerWidth - popoverWidth - viewportPadding)
    );
    let top = anchorRect.bottom + 6;
    if (top + estimatedHeight > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, anchorRect.top - estimatedHeight - 6);
    }
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    const input = popover.querySelector("#filter-values-search");
    if (input) input.focus();
  }

  function applyDraftFilter() {
    if (!activeFilterField || !draft) return;
    columnFilters[activeFilterField] = {
      mode: draft.mode,
      term: draft.term.trim().toLowerCase(),
      selectedValues: draft.selectedValues === null ? null : [...draft.selectedValues],
    };
    activeFilterField = "";
    draft = null;
    renderResultsTable();
  }

  function clearFieldFilter(field) {
    columnFilters[field] = { mode: "contains", term: "", selectedValues: null };
  }

  function rerenderPopover() {
    if (!activeFilterField) return;
    const activeButton = resultsNode.querySelector(`.filter-toggle[data-field="${activeFilterField}"]`);
    if (!activeButton) return;
    openFilterPopover(activeFilterField, activeButton);
  }

  function renderResultsTable() {
    if (!baseResults.length) {
      closePatientActionMenu();
      resultsNode.classList.remove("hidden");
      resultsNode.innerHTML = `<p class="subtle table-empty">No patients found.</p>`;
      return;
    }

    const processed = getFilteredSortedRows();
    patientLookup = new Map(processed.map((patient) => [getPatientKey(patient), patient]));
    resultsNode.classList.remove("hidden");
    resultsNode.innerHTML = `
      <table class="patient-results-table">
        <thead>
          <tr>
            <th><div class="th-wrap"><button type="button" class="sort-btn" data-field="patientId">Patient ID ${sortIndicator("patientId")}</button><button type="button" class="filter-toggle ${columnFilters.patientId.term || columnFilters.patientId.selectedValues !== null ? "active" : ""}" data-field="patientId">${filterIndicator("patientId")}</button></div></th>
            <th><div class="th-wrap"><button type="button" class="sort-btn" data-field="name">Name ${sortIndicator("name")}</button><button type="button" class="filter-toggle ${columnFilters.name.term || columnFilters.name.selectedValues !== null ? "active" : ""}" data-field="name">${filterIndicator("name")}</button></div></th>
            <th><div class="th-wrap"><button type="button" class="sort-btn" data-field="contact">Contact ${sortIndicator("contact")}</button><button type="button" class="filter-toggle ${columnFilters.contact.term || columnFilters.contact.selectedValues !== null ? "active" : ""}" data-field="contact">${filterIndicator("contact")}</button></div></th>
            <th><div class="th-wrap"><button type="button" class="sort-btn" data-field="dob">DOB ${sortIndicator("dob")}</button><button type="button" class="filter-toggle ${columnFilters.dob.term || columnFilters.dob.selectedValues !== null ? "active" : ""}" data-field="dob">${filterIndicator("dob")}</button></div></th>
            <th><div class="th-wrap"><button type="button" class="sort-btn" data-field="mrn">MRN ${sortIndicator("mrn")}</button><button type="button" class="filter-toggle ${columnFilters.mrn.term || columnFilters.mrn.selectedValues !== null ? "active" : ""}" data-field="mrn">${filterIndicator("mrn")}</button></div></th>
            <th><div class="th-wrap"><button type="button" class="sort-btn" data-field="provider">Provider ${sortIndicator("provider")}</button><button type="button" class="filter-toggle ${columnFilters.provider.term || columnFilters.provider.selectedValues !== null ? "active" : ""}" data-field="provider">${filterIndicator("provider")}</button></div></th>
            ${canEditPatients ? '<th class="patient-actions-col">Actions</th>' : ""}
          </tr>
        </thead>
        <tbody>
          ${processed
            .slice(0, 50)
            .map((patient) => {
              const fullName = getName(patient);
              const patientKey = getPatientKey(patient);
              return `
                <tr>
                  <td>${patient.patientId || "-"}</td>
                  <td>${fullName || "-"}</td>
                  <td>${patient.phone || "-"}</td>
                  <td>${formatDateForCard(patient.dob)}</td>
                  <td>${patient.mrn || "-"}</td>
                  <td>${patient.provider || "-"}</td>
                  ${
                    canEditPatients
                      ? `
                        <td class="patient-actions-cell">
                          <button
                            type="button"
                            class="patient-row-action-trigger"
                            data-patient-row-menu="${escapeHtml(patientKey)}"
                            aria-haspopup="menu"
                            aria-expanded="${activePatientActionKey === patientKey ? "true" : "false"}"
                            aria-label="Open patient actions"
                          >⋮</button>
                        </td>
                      `
                      : ""
                  }
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
      <div class="table-meta">${processed.length} result(s)</div>
      <div id="column-filter-popover" class="column-filter-popover hidden"></div>
      ${canEditPatients ? '<div id="patient-row-action-menu" class="patient-row-action-menu hidden" role="menu"></div>' : ""}
    `;

    if (activeFilterField) {
      rerenderPopover();
    }

    resultsNode.onclick = (event) => {
      const sortButton = event.target.closest(".sort-btn");
      if (sortButton) {
        const field = sortButton.dataset.field;
        if (!field) return;
        closePatientActionMenu();
        activeFilterField = "";
        if (sortField === field) sortDirection = sortDirection === "asc" ? "desc" : "asc";
        else {
          sortField = field;
          sortDirection = "asc";
        }
        renderResultsTable();
        return;
      }

      const filterButton = event.target.closest(".filter-toggle");
      if (filterButton) {
        closePatientActionMenu();
        const field = filterButton.dataset.field;
        if (!field) return;
        if (activeFilterField === field) {
          closeFilterPopover();
          return;
        }
        draft = null;
        openFilterPopover(field, filterButton);
        return;
      }

      const patientActionButton = event.target.closest("[data-patient-row-menu]");
      if (patientActionButton) {
        const patientKey = patientActionButton.getAttribute("data-patient-row-menu");
        if (!patientKey) return;
        if (activePatientActionKey === patientKey) {
          closePatientActionMenu();
          return;
        }
        closeFilterPopover();
        openPatientActionMenu(patientKey, patientActionButton);
        return;
      }

      const editActionButton = event.target.closest('[data-patient-action="edit"]');
      if (editActionButton) {
        const patientKey = editActionButton.getAttribute("data-patient-key");
        closePatientActionMenu();
        if (patientKey) openPatientEditModal(patientKey);
        return;
      }

      if (event.target.closest("[data-sort]")) {
        const dir = event.target.getAttribute("data-sort");
        if (!activeFilterField || !dir) return;
        sortField = activeFilterField;
        sortDirection = dir === "desc" ? "desc" : "asc";
        closeFilterPopover();
        renderResultsTable();
        return;
      }

      if (event.target.closest("[data-open-text-menu]")) {
        textFilterMenuOpen = !textFilterMenuOpen;
        const menu = resultsNode.querySelector("#text-filter-menu");
        if (menu) menu.classList.toggle("hidden", !textFilterMenuOpen);
        return;
      }

      if (event.target.closest(".text-filter-option")) {
        const mode = event.target.getAttribute("data-mode");
        if (!draft || !mode) return;
        draft.mode = mode;
        textFilterMenuOpen = false;
        const menu = resultsNode.querySelector("#text-filter-menu");
        if (menu) menu.classList.add("hidden");
        const textTag = resultsNode.querySelector(".text-filter-inline span");
        if (textTag) textTag.textContent = `${mode.replace("_", " ").toUpperCase()}:`;
        return;
      }

      if (event.target.closest("[data-filter-clear]")) {
        if (!activeFilterField) return;
        clearFieldFilter(activeFilterField);
        closeFilterPopover();
        renderResultsTable();
        return;
      }

      if (event.target.closest("[data-filter-cancel]")) {
        closeFilterPopover();
        return;
      }

      if (event.target.closest("[data-filter-apply]")) {
        const termInput = resultsNode.querySelector("#text-filter-term");
        if (draft && termInput) draft.term = termInput.value;
        applyDraftFilter();
        return;
      }

      if (event.target.id === "filter-select-all") {
        if (!draft) return;
        const selectAll = event.target.checked;
        draft.selectedValues = selectAll ? null : [];
        rerenderPopover();
        return;
      }

      const valueCheck = event.target.closest(".filter-value-check");
      if (valueCheck) {
        if (!draft) return;
        const filteredValues = valueCache.filter((value) => value.toLowerCase().includes((draft.valueSearch || "").toLowerCase()));
        const index = Number(valueCheck.getAttribute("data-value-index"));
        const value = filteredValues[index];
        if (!value) return;
        const set = new Set(draft.selectedValues === null ? valueCache : draft.selectedValues);
        if (valueCheck.checked) set.add(value);
        else set.delete(value);
        draft.selectedValues = set.size === valueCache.length ? null : [...set];
        const selectAll = resultsNode.querySelector("#filter-select-all");
        if (selectAll) selectAll.checked = draft.selectedValues === null;
        return;
      }

      if (event.target.id === "filter-values-search") {
        return;
      }

      if (!event.target.closest(".column-filter-popover")) {
        closeFilterPopover();
      }

      if (!event.target.closest(".patient-row-action-menu")) {
        closePatientActionMenu();
      }
    };

    resultsNode.oninput = (event) => {
      if (event.target.id === "filter-values-search") {
        if (!draft) return;
        draft.valueSearch = event.target.value;
        rerenderPopover();
        return;
      }
      if (event.target.id === "text-filter-term") {
        if (!draft) return;
        draft.term = event.target.value;
      }
    };
  }

  function runPatientSearch() {
    const name = panelBody.querySelector('input[name="searchName"]').value.trim().toLowerCase();
    const contact = panelBody.querySelector('input[name="searchContact"]').value.trim().toLowerCase();
    const dob = panelBody.querySelector('input[name="searchDob"]').value;
    const mrn = panelBody.querySelector('input[name="searchMrn"]')?.value.trim().toLowerCase() || "";
    const patientId = panelBody.querySelector('input[name="searchPatientId"]')?.value.trim().toLowerCase() || "";

    baseResults = allPatients.filter((patient) => {
      const fullName = `${patient.firstName || ""} ${patient.middleName || ""} ${patient.lastName || ""}`
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (name && !fullName.includes(name)) return false;
      if (contact && !String(patient.phone || "").toLowerCase().includes(contact)) return false;
      if (dob && patient.dob !== dob) return false;
      if (mrn && !String(patient.mrn || "").toLowerCase().includes(mrn)) return false;
      if (patientId && !String(patient.patientId || "").toLowerCase().includes(patientId)) return false;
      return true;
    });
    renderResultsTable();
  }

  patientEditForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (patientSaveInFlight) return;

    const values = collectPatientEditValues();
    if (!values.patientId) {
      setPatientEditFeedback("Patient ID is required to save this record.");
      return;
    }

    patientSaveInFlight = true;
    if (patientEditSaveBtn) patientEditSaveBtn.disabled = true;
    setPatientEditFeedback("");

    try {
      const payload = await updatePatientProfile(values);
      allPatients = getSearchablePatients();
      runPatientSearch();
      closePatientEditModal();
      setFeedback(
        `Patient ${values.patientId} updated in storage. ${Number(payload?.updatedRegistrations || 0)} registration record(s) refreshed.`,
        "neutral"
      );
    } catch (error) {
      patientSaveInFlight = false;
      if (patientEditSaveBtn) patientEditSaveBtn.disabled = false;
      setPatientEditFeedback(error?.message || "Unable to update patient record.");
    }
  });

  patientEditForm?.elements?.dob?.addEventListener("input", syncPatientEditAge);
  patientEditForm?.elements?.dob?.addEventListener("change", syncPatientEditAge);
  patientEditModalNode?.addEventListener("click", (event) => {
    if (patientSaveInFlight) return;
    if (event.target === patientEditModalNode || event.target.closest("[data-patient-edit-close]")) {
      closePatientEditModal();
    }
  });
  patientEditModalNode?.addEventListener("keydown", (event) => {
    if (patientSaveInFlight) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closePatientEditModal();
    }
  });

  searchBtn.addEventListener("click", runPatientSearch);
  moreBtn.addEventListener("click", () => {
    const willShow = morePanel.classList.contains("hidden");
    morePanel.classList.toggle("hidden");
    moreBtn.textContent = willShow ? "Show Less ↑" : "Show More ↓";
  });

  // Default table state: show all records when opening Patient Search.
  baseResults = [...allPatients];
  renderResultsTable();
}

function renderMasterRegistry() {
  panelBody.innerHTML = `
    <section class="master-registry-page">
      <div class="mr-tabs" role="tablist" aria-label="Master Registry Sections">
        <button type="button" class="mr-tab active" data-mr-tab="organisms" aria-selected="true">Organisms</button>
        <button type="button" class="mr-tab" data-mr-tab="antibiotic-genes" aria-selected="false">Antibiotic Resistance Gene</button>
        <button type="button" class="mr-tab" data-mr-tab="icd-codes" aria-selected="false">ICD Codes</button>
      </div>

      <div id="mr-toolbar"></div>
      <p id="mr-feedback" class="pm-feedback hidden"></p>
      <section id="mr-editor" class="pm-editor hidden"></section>
      <div id="mr-summary" class="master-registry-summary"></div>

      <div class="master-registry-table-wrap">
        <table class="master-registry-table">
          <thead id="mr-table-head"></thead>
          <tbody id="mr-table-body"></tbody>
        </table>
      </div>
      <div id="mr-pagination" class="mr-pagination hidden"></div>
    </section>
  `;

  const tabButtons = Array.from(panelBody.querySelectorAll("[data-mr-tab]"));
  const toolbarHostNode = document.getElementById("mr-toolbar");
  const feedbackNode = document.getElementById("mr-feedback");
  const editorNode = document.getElementById("mr-editor");
  const summaryNode = document.getElementById("mr-summary");
  const headNode = document.getElementById("mr-table-head");
  const bodyNode = document.getElementById("mr-table-body");
  const paginationNode = document.getElementById("mr-pagination");
  const icdPageSizeOptions = [25, 50, 100, 250];
  const icdSearchMinChars = 2;

  let activeTab = "organisms";
  let editorMode = "";
  const tabState = {
    organisms: { query: "", type: "", status: "" },
    genes: { query: "", resistanceClass: "" },
    icd: { query: "", panel: "", mode: "search", page: 1, pageSize: 50 },
  };

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function setFeedback(message, isError = false) {
    const text = String(message || "").trim();
    if (!text) {
      feedbackNode.textContent = "";
      feedbackNode.classList.add("hidden");
      feedbackNode.classList.remove("error");
      return;
    }
    feedbackNode.textContent = text;
    feedbackNode.classList.remove("hidden");
    feedbackNode.classList.toggle("error", Boolean(isError));
  }

  function setTableHead(columns) {
    headNode.innerHTML = `
      <tr>
        ${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}
      </tr>
    `;
  }

  function parseCommaValues(raw) {
    return Array.from(
      new Set(
        String(raw || "")
          .split(",")
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
    );
  }

  function normalizePanelLabels(values) {
    return parseCommaValues(values).map((value) => {
      const needle = normalizePanelKey(value);
      const matched = orderPanelCatalog.find((panel) => {
        return normalizePanelKey(panel.id) === needle
          || normalizePanelKey(panel.name) === needle
          || normalizePanelKey(panel.alias) === needle;
      });
      return matched ? matched.name : value;
    });
  }

  function buildLocalId(prefix) {
    return `${prefix}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function buildToolbarShell(contentMarkup, buttonLabel) {
    return `
      <div class="mr-toolbar-shell">
        ${contentMarkup}
        <div class="mr-toolbar-actions">
          <button type="button" class="btn-primary" data-mr-add-record>${escapeHtml(buttonLabel)}</button>
        </div>
      </div>
    `;
  }

  function clearPagination() {
    paginationNode.innerHTML = "";
    paginationNode.classList.add("hidden");
  }

  function buildIcdPanelNamesByCode() {
    const panelNamesByCode = new Map();
    orderPanelCatalog.forEach((panel) => {
      const panelName = String(panel?.name || "").trim();
      if (!panelName) return;
      normalizeIcdCodeList(Array.isArray(panel?.icdCodes) ? panel.icdCodes : []).forEach((code) => {
        if (!panelNamesByCode.has(code)) panelNamesByCode.set(code, []);
        panelNamesByCode.get(code).push(panelName);
      });
    });

    panelNamesByCode.forEach((panelNames) => {
      panelNames.sort((left, right) => left.localeCompare(right));
    });

    return panelNamesByCode;
  }

  function buildIcdRegistryRow(item, panelNames) {
    const code = String(item?.code || "").trim();
    return {
      code,
      description: String(item?.description || "").trim(),
      formattedCode: item?.formattedCode || formatIcdCode(code),
      panels: Array.isArray(panelNames) ? panelNames : [],
    };
  }

  function getIcdPaginationState(totalRows) {
    const pageSize = icdPageSizeOptions.includes(Number(tabState.icd.pageSize))
      ? Number(tabState.icd.pageSize)
      : 50;
    const totalPages = Math.max(1, Math.ceil(Math.max(totalRows, 1) / pageSize));
    const page = Math.min(Math.max(1, Number(tabState.icd.page) || 1), totalPages);
    tabState.icd.page = page;
    tabState.icd.pageSize = pageSize;

    const startIndex = totalRows ? (page - 1) * pageSize : 0;
    const endIndex = Math.min(startIndex + pageSize, totalRows);
    return {
      page,
      pageSize,
      totalPages,
      startIndex,
      endIndex,
      startNumber: totalRows ? startIndex + 1 : 0,
      endNumber: endIndex,
    };
  }

  function renderIcdPagination(totalRows) {
    if (!totalRows) {
      clearPagination();
      return;
    }

    const pagination = getIcdPaginationState(totalRows);
    paginationNode.classList.remove("hidden");
    paginationNode.innerHTML = `
      <div class="mr-pagination-summary">
        <strong>${pagination.startNumber}-${pagination.endNumber}</strong>
        <span>of ${totalRows} ICD codes</span>
      </div>
      <div class="mr-pagination-controls">
        <label class="mr-inline-field">
          <span>Rows</span>
          <select id="mr-icd-page-size">
            ${icdPageSizeOptions.map((option) => `<option value="${option}" ${option === pagination.pageSize ? "selected" : ""}>${option}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="btn-ghost pm-row-btn" id="mr-icd-page-prev" ${pagination.page <= 1 ? "disabled" : ""}>Previous</button>
        <span class="mr-pagination-page">Page ${pagination.page} of ${pagination.totalPages}</span>
        <button type="button" class="btn-ghost pm-row-btn" id="mr-icd-page-next" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>Next</button>
      </div>
    `;

    document.getElementById("mr-icd-page-size")?.addEventListener("change", (event) => {
      tabState.icd.pageSize = Number(event.target.value) || 50;
      tabState.icd.page = 1;
      renderRows();
    });

    document.getElementById("mr-icd-page-prev")?.addEventListener("click", () => {
      tabState.icd.page = Math.max(1, tabState.icd.page - 1);
      renderRows();
    });

    document.getElementById("mr-icd-page-next")?.addEventListener("click", () => {
      tabState.icd.page += 1;
      renderRows();
    });
  }

  function renderEditor() {
    if (editorMode !== activeTab) {
      editorNode.classList.add("hidden");
      editorNode.innerHTML = "";
      return;
    }

    if (activeTab === "organisms") {
      const organismTypes = Array.from(
        new Set(["bacteria", "virus", "fungus", "parasite", "other", ...masterRegistryRecords.map((row) => String(row.type || "").trim()).filter(Boolean)])
      ).sort((a, b) => a.localeCompare(b));
      const statuses = Array.from(
        new Set(["active", "deprecated", ...masterRegistryRecords.map((row) => String(row.status || "").trim()).filter(Boolean)])
      ).sort((a, b) => a.localeCompare(b));

      editorNode.classList.remove("hidden");
      editorNode.innerHTML = `
        <div class="pm-editor-head">
          <h4>Add Organism</h4>
          <p>Create a new organism record in Master Registry.</p>
        </div>
        <form class="pm-editor-form" data-mr-create-form="organisms">
          <label class="mr-field">
            <span>Scientific Name *</span>
            <input name="scientificName" required placeholder="e.g. Enterococcus gallinarum">
          </label>
          <label class="mr-field">
            <span>Common Name</span>
            <input name="commonName" placeholder="Optional common name">
          </label>
          <label class="mr-field">
            <span>Type</span>
            <select name="type">
              ${organismTypes.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}
            </select>
          </label>
          <label class="mr-field">
            <span>Status</span>
            <select name="status">
              ${statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("")}
            </select>
          </label>
          <label class="mr-field">
            <span>NCBI Tax ID</span>
            <input name="ncbiTaxId" inputmode="numeric" placeholder="Optional numeric tax ID">
          </label>
          <label class="mr-field">
            <span>Panels</span>
            <input name="panels" placeholder="Comma-separated panel names">
          </label>
          <label class="mr-field pm-editor-span">
            <span>Synonyms</span>
            <textarea name="synonyms" rows="2" placeholder="Comma-separated synonyms"></textarea>
          </label>
          <div class="pm-editor-actions pm-editor-span">
            <button type="button" class="btn-ghost" data-mr-editor-cancel>Cancel</button>
            <button type="submit" class="btn-primary">Add Organism</button>
          </div>
        </form>
      `;
      return;
    }

    if (activeTab === "antibiotic-genes") {
      const statuses = Array.from(
        new Set(["active", "deprecated", ...masterResistanceGeneCatalog.map((row) => String(row.status || "").trim()).filter(Boolean)])
      ).sort((a, b) => a.localeCompare(b));

      editorNode.classList.remove("hidden");
      editorNode.innerHTML = `
        <div class="pm-editor-head">
          <h4>Add Antibiotic Resistance Gene</h4>
          <p>Create a new ABR gene record in Master Registry.</p>
        </div>
        <form class="pm-editor-form" data-mr-create-form="genes">
          <label class="mr-field">
            <span>Gene *</span>
            <input name="gene" required placeholder="e.g. blaNDM">
          </label>
          <label class="mr-field">
            <span>Resistance Class *</span>
            <input name="resistanceClass" required placeholder="e.g. Carbapenem resistance Marker">
          </label>
          <label class="mr-field">
            <span>Status</span>
            <select name="status">
              ${statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("")}
            </select>
          </label>
          <label class="mr-field">
            <span>Panels</span>
            <input name="panels" placeholder="Comma-separated panel names">
          </label>
          <label class="mr-field pm-editor-span">
            <span>Aliases</span>
            <textarea name="aliases" rows="2" placeholder="Comma-separated aliases"></textarea>
          </label>
          <div class="pm-editor-actions pm-editor-span">
            <button type="button" class="btn-ghost" data-mr-editor-cancel>Cancel</button>
            <button type="submit" class="btn-primary">Add Gene</button>
          </div>
        </form>
      `;
      return;
    }

    editorNode.classList.remove("hidden");
    editorNode.innerHTML = `
      <div class="pm-editor-head">
        <h4>Add ICD Code</h4>
        <p>Create a new ICD code record and map it to all panels.</p>
      </div>
      <form class="pm-editor-form" data-mr-create-form="icd-codes">
        <label class="mr-field">
          <span>ICD Code *</span>
          <input name="code" required placeholder="e.g. N39.0 or N390">
        </label>
        <label class="mr-field">
          <span>Description *</span>
          <input name="description" required placeholder="Diagnosis description">
        </label>
        <div class="pm-editor-actions pm-editor-span">
          <button type="button" class="btn-ghost" data-mr-editor-cancel>Cancel</button>
          <button type="submit" class="btn-primary">Add ICD Code</button>
        </div>
      </form>
    `;
  }

  function renderOrganismRows() {
    const query = tabState.organisms.query.trim().toLowerCase();
    const selectedType = tabState.organisms.type;
    const selectedStatus = tabState.organisms.status;

    const filtered = masterRegistryRecords
      .filter((row) => {
        const rowType = String(row.type || "").trim();
        const rowStatus = String(row.status || "").trim();
        if (selectedType && rowType !== selectedType) return false;
        if (selectedStatus && rowStatus !== selectedStatus) return false;
        if (!query) return true;

        const haystack = [
          row.id,
          row.scientific_name,
          row.common_name,
          row.type,
          row.status,
          row.ncbi_tax_id === null ? "" : String(row.ncbi_tax_id),
          (Array.isArray(row.synonyms) ? row.synonyms : []).join(" "),
          (Array.isArray(row.panels) ? row.panels : []).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => String(a.scientific_name || "").localeCompare(String(b.scientific_name || "")));

    const typeCounts = Array.from(
      filtered.reduce((map, row) => {
        const key = String(row.type || "other").trim() || "other";
        map.set(key, (map.get(key) || 0) + 1);
        return map;
      }, new Map())
    )
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([type, count]) => `<div class="mr-stat"><strong>${count}</strong><span>${escapeHtml(type)}</span></div>`)
      .join("");

    setTableHead(["ID", "Scientific Name", "Common Name", "Type", "NCBI Tax ID", "Synonyms", "Status", "Panels"]);
    summaryNode.innerHTML = `
      <div class="mr-stat"><strong>${filtered.length}</strong><span>records</span></div>
      <div class="mr-stat"><strong>${filtered.filter((row) => row.status === "active").length}</strong><span>active</span></div>
      <div class="mr-stat"><strong>${filtered.filter((row) => row.status === "deprecated").length}</strong><span>deprecated</span></div>
      ${typeCounts}
    `;

    if (!filtered.length) {
      bodyNode.innerHTML = `<tr><td colspan="8" class="table-empty">No organism records found.</td></tr>`;
      return;
    }

    bodyNode.innerHTML = filtered
      .map((row) => {
        const synonyms = Array.isArray(row.synonyms) && row.synonyms.length ? row.synonyms.join(", ") : "-";
        const panels = Array.isArray(row.panels) && row.panels.length ? row.panels.join(", ") : "-";
        return `
          <tr>
            <td class="mono">${escapeHtml(row.id)}</td>
            <td><strong>${escapeHtml(row.scientific_name)}</strong></td>
            <td>${escapeHtml(row.common_name || "-")}</td>
            <td><span class="mr-type-pill mr-type-${escapeHtml(row.type)}">${escapeHtml(row.type || "other")}</span></td>
            <td>${row.ncbi_tax_id === null || row.ncbi_tax_id === undefined ? "-" : escapeHtml(row.ncbi_tax_id)}</td>
            <td>${escapeHtml(synonyms)}</td>
            <td>${escapeHtml(row.status || "-")}</td>
            <td>${escapeHtml(panels)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderResistanceGeneRows() {
    const query = tabState.genes.query.trim().toLowerCase();
    const selectedClass = tabState.genes.resistanceClass;

    const filtered = masterResistanceGeneCatalog
      .filter((row) => {
        if (selectedClass && row.resistanceClass !== selectedClass) return false;
        if (!query) return true;
        const haystack = [
          row.gene,
          row.resistanceClass,
          row.status,
          row.aliases.join(" "),
          row.panels.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => a.gene.localeCompare(b.gene));

    const classCount = new Set(filtered.map((row) => row.resistanceClass)).size;
    const aliasCount = filtered.filter((row) => row.aliases.length > 1).length;

    setTableHead(["Gene", "Resistance Class", "Aliases", "Status", "Panels"]);
    summaryNode.innerHTML = `
      <div class="mr-stat"><strong>${filtered.length}</strong><span>genes</span></div>
      <div class="mr-stat"><strong>${classCount}</strong><span>resistance classes</span></div>
      <div class="mr-stat"><strong>${aliasCount}</strong><span>with alternate alias</span></div>
      <div class="mr-stat"><strong>${filtered.filter((row) => row.status === "active").length}</strong><span>active</span></div>
    `;

    if (!filtered.length) {
      bodyNode.innerHTML = `<tr><td colspan="5" class="table-empty">No resistance genes found.</td></tr>`;
      return;
    }

    bodyNode.innerHTML = filtered
      .map((row) => {
        const aliases = row.aliases.length ? row.aliases.join(", ") : "-";
        const panels = row.panels.length ? row.panels.join(", ") : "-";
        return `
          <tr>
            <td><strong>${escapeHtml(row.gene)}</strong></td>
            <td>${escapeHtml(row.resistanceClass)}</td>
            <td>${escapeHtml(aliases)}</td>
            <td>${escapeHtml(row.status)}</td>
            <td>${escapeHtml(panels)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderIcdRows() {
    const query = String(tabState.icd.query || "").trim();
    const selectedPanel = tabState.icd.panel;
    const isSearchMode = tabState.icd.mode === "search";
    const panelNamesByCode = buildIcdPanelNamesByCode();
    const totalMappedCount = panelNamesByCode.size;
    const totalLinkedPanels = new Set(Array.from(panelNamesByCode.values()).flat()).size;

    setTableHead(["ICD Code", "Description", "Panels", "Panel Count"]);

    if (isSearchMode && !query && !selectedPanel) {
      summaryNode.innerHTML = `
        <div class="mr-stat"><strong>${icdCatalogSearchRows.length}</strong><span>codes</span></div>
        <div class="mr-stat"><strong>${totalMappedCount}</strong><span>mapped codes</span></div>
        <div class="mr-stat"><strong>${totalLinkedPanels}</strong><span>linked panels</span></div>
        <div class="mr-stat"><strong>Search</strong><span>mode</span></div>
      `;
      bodyNode.innerHTML = `<tr><td colspan="4" class="table-empty">Type at least ${icdSearchMinChars} characters or choose a panel to search ICD codes without loading the full catalog.</td></tr>`;
      clearPagination();
      return;
    }

    if (isSearchMode && query && query.length < icdSearchMinChars && !normalizeIcdCode(query) && !selectedPanel) {
      summaryNode.innerHTML = `
        <div class="mr-stat"><strong>${icdCatalogSearchRows.length}</strong><span>codes</span></div>
        <div class="mr-stat"><strong>${totalMappedCount}</strong><span>mapped codes</span></div>
        <div class="mr-stat"><strong>${totalLinkedPanels}</strong><span>linked panels</span></div>
        <div class="mr-stat"><strong>Search</strong><span>mode</span></div>
      `;
      bodyNode.innerHTML = `<tr><td colspan="4" class="table-empty">Keep typing to search. Enter at least ${icdSearchMinChars} characters for broad text search.</td></tr>`;
      clearPagination();
      return;
    }

    let matchedRows = [];

    if (!isSearchMode && !query && !selectedPanel) {
      const pagination = getIcdPaginationState(icdCatalogSearchRows.length);
      matchedRows = icdCatalogSearchRows
        .slice(pagination.startIndex, pagination.endIndex)
        .map((item) => buildIcdRegistryRow(item, panelNamesByCode.get(item.code) || []));

      summaryNode.innerHTML = `
        <div class="mr-stat"><strong>${icdCatalogSearchRows.length}</strong><span>codes</span></div>
        <div class="mr-stat"><strong>${totalMappedCount}</strong><span>mapped codes</span></div>
        <div class="mr-stat"><strong>${totalLinkedPanels}</strong><span>linked panels</span></div>
        <div class="mr-stat"><strong>Browse</strong><span>mode</span></div>
      `;

      renderIcdPagination(icdCatalogSearchRows.length);
    } else {
      const filteredRows = [];
      icdCatalogSearchRows.forEach((item) => {
        const panelNames = panelNamesByCode.get(item.code) || [];
        if (selectedPanel && !panelNames.includes(selectedPanel)) return;
        if (!matchesIcdSearch(item, query, panelNames)) return;
        filteredRows.push(buildIcdRegistryRow(item, panelNames));
      });

      const pagination = getIcdPaginationState(filteredRows.length);
      matchedRows = filteredRows.slice(pagination.startIndex, pagination.endIndex);

      summaryNode.innerHTML = `
        <div class="mr-stat"><strong>${filteredRows.length}</strong><span>${isSearchMode ? "matches" : "codes"}</span></div>
        <div class="mr-stat"><strong>${filteredRows.filter((row) => row.panels.length > 0).length}</strong><span>mapped codes</span></div>
        <div class="mr-stat"><strong>${new Set(filteredRows.flatMap((row) => row.panels)).size}</strong><span>linked panels</span></div>
        <div class="mr-stat"><strong>${isSearchMode ? "Search" : "Browse"}</strong><span>mode</span></div>
      `;

      renderIcdPagination(filteredRows.length);
    }

    if (!matchedRows.length) {
      bodyNode.innerHTML = `<tr><td colspan="4" class="table-empty">No ICD codes found.</td></tr>`;
      return;
    }

    bodyNode.innerHTML = matchedRows
      .map((row) => `
        <tr>
          <td class="mono">${escapeHtml(row.formattedCode)}</td>
          <td>${escapeHtml(row.description || "-")}</td>
          <td>${escapeHtml(row.panels.length ? row.panels.join(", ") : "-")}</td>
          <td>${row.panels.length}</td>
        </tr>
      `)
      .join("");
  }

  function renderRows() {
    if (activeTab === "organisms") {
      clearPagination();
      renderOrganismRows();
      return;
    }
    if (activeTab === "antibiotic-genes") {
      clearPagination();
      renderResistanceGeneRows();
      return;
    }
    renderIcdRows();
  }

  function renderToolbar() {
    if (activeTab === "organisms") {
      const organismTypes = Array.from(
        new Set(masterRegistryRecords.map((row) => String(row.type || "").trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));
      const statuses = Array.from(
        new Set(masterRegistryRecords.map((row) => String(row.status || "").trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));

      toolbarHostNode.innerHTML = buildToolbarShell(`
        <div class="master-registry-toolbar">
          <label class="mr-field mr-wide">
            <span>Search Organisms</span>
            <input id="mr-search" placeholder="Search scientific name, common name, synonym, panel">
          </label>
          <label class="mr-field">
            <span>Type</span>
            <select id="mr-type">
              <option value="">All</option>
              ${organismTypes.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}
            </select>
          </label>
          <label class="mr-field">
            <span>Status</span>
            <select id="mr-status">
              <option value="">All</option>
              ${statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("")}
            </select>
          </label>
        </div>
      `, "Add Organism");

      const searchInput = document.getElementById("mr-search");
      const typeInput = document.getElementById("mr-type");
      const statusInput = document.getElementById("mr-status");
      searchInput.value = tabState.organisms.query;
      typeInput.value = tabState.organisms.type;
      statusInput.value = tabState.organisms.status;

      searchInput.addEventListener("input", () => {
        tabState.organisms.query = searchInput.value;
        renderRows();
      });
      typeInput.addEventListener("change", () => {
        tabState.organisms.type = typeInput.value;
        renderRows();
      });
      statusInput.addEventListener("change", () => {
        tabState.organisms.status = statusInput.value;
        renderRows();
      });
    } else if (activeTab === "antibiotic-genes") {
      const resistanceClasses = Array.from(
        new Set(masterResistanceGeneCatalog.map((row) => row.resistanceClass))
      ).sort((a, b) => a.localeCompare(b));

      toolbarHostNode.innerHTML = buildToolbarShell(`
        <div class="master-registry-toolbar mr-toolbar-two">
          <label class="mr-field mr-wide">
            <span>Search Antibiotic Resistance Gene</span>
            <input id="mr-gene-search" placeholder="Search gene, resistance class, alias, panel">
          </label>
          <label class="mr-field">
            <span>Resistance Class</span>
            <select id="mr-gene-class">
              <option value="">All</option>
              ${resistanceClasses.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}
            </select>
          </label>
        </div>
      `, "Add Gene");

      const searchInput = document.getElementById("mr-gene-search");
      const classInput = document.getElementById("mr-gene-class");
      searchInput.value = tabState.genes.query;
      classInput.value = tabState.genes.resistanceClass;

      searchInput.addEventListener("input", () => {
        tabState.genes.query = searchInput.value;
        renderRows();
      });
      classInput.addEventListener("change", () => {
        tabState.genes.resistanceClass = classInput.value;
        renderRows();
      });
    } else {
      const panelNames = orderPanelCatalog
        .map((panel) => panel.name)
        .filter(Boolean)
        .slice()
        .sort((a, b) => a.localeCompare(b));

      toolbarHostNode.innerHTML = buildToolbarShell(`
        <div class="mr-icd-toolbar-stack">
          <div class="mr-subtabs" role="tablist" aria-label="ICD registry modes">
            <button
              type="button"
              class="mr-tab mr-subtab ${tabState.icd.mode === "search" ? "active" : ""}"
              data-mr-icd-mode="search"
              aria-selected="${tabState.icd.mode === "search" ? "true" : "false"}"
            >
              Search
            </button>
            <button
              type="button"
              class="mr-tab mr-subtab ${tabState.icd.mode === "browse" ? "active" : ""}"
              data-mr-icd-mode="browse"
              aria-selected="${tabState.icd.mode === "browse" ? "true" : "false"}"
            >
              Browse All
            </button>
          </div>
          <div class="master-registry-toolbar mr-toolbar-two">
            <label class="mr-field mr-wide">
              <span>${tabState.icd.mode === "search" ? "Search ICD Codes" : "Browse ICD Codes"}</span>
              <input
                id="mr-icd-search"
                placeholder="${tabState.icd.mode === "search"
                  ? "Search ICD code, description, or panel"
                  : "Optional filter by ICD code or description"}"
              >
            </label>
            <label class="mr-field">
              <span>Panel</span>
              <select id="mr-icd-panel">
                <option value="">All</option>
                ${panelNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}
              </select>
            </label>
          </div>
        </div>
      `, "Add ICD Code");

      const searchInput = document.getElementById("mr-icd-search");
      const panelInput = document.getElementById("mr-icd-panel");
      searchInput.value = tabState.icd.query;
      panelInput.value = tabState.icd.panel;

      toolbarHostNode.querySelectorAll("[data-mr-icd-mode]").forEach((button) => {
        button.addEventListener("click", () => {
          const nextMode = String(button.getAttribute("data-mr-icd-mode") || "").trim();
          if (!nextMode || nextMode === tabState.icd.mode) return;
          tabState.icd.mode = nextMode;
          tabState.icd.page = 1;
          renderToolbar();
          renderRows();
        });
      });

      searchInput.addEventListener("input", () => {
        tabState.icd.query = searchInput.value;
        tabState.icd.page = 1;
        renderRows();
      });
      panelInput.addEventListener("change", () => {
        tabState.icd.panel = panelInput.value;
        tabState.icd.page = 1;
        renderRows();
      });
    }

    const addBtn = toolbarHostNode.querySelector("[data-mr-add-record]");
    addBtn?.addEventListener("click", () => {
      editorMode = activeTab;
      setFeedback("");
      renderEditor();
    });
  }

  function renderTabs() {
    tabButtons.forEach((button) => {
      const tab = button.getAttribute("data-mr-tab") || "";
      const isActive = tab === activeTab;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  editorNode.addEventListener("click", (event) => {
    if (!event.target.closest("[data-mr-editor-cancel]")) return;
    editorMode = "";
    renderEditor();
    setFeedback("");
  });

  editorNode.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-mr-create-form]");
    if (!form) return;
    event.preventDefault();

    const formMode = String(form.getAttribute("data-mr-create-form") || "").trim();

    if (formMode === "organisms") {
      const scientificName = String(form.querySelector('[name="scientificName"]')?.value || "").trim();
      const commonName = String(form.querySelector('[name="commonName"]')?.value || "").trim();
      const type = String(form.querySelector('[name="type"]')?.value || "bacteria").trim() || "bacteria";
      const status = String(form.querySelector('[name="status"]')?.value || "active").trim() || "active";
      const ncbiTaxId = String(form.querySelector('[name="ncbiTaxId"]')?.value || "").trim();
      const synonyms = parseCommaValues(form.querySelector('[name="synonyms"]')?.value || "");
      const panels = normalizePanelLabels(form.querySelector('[name="panels"]')?.value || "");

      if (!scientificName) {
        setFeedback("Scientific name is required.", true);
        return;
      }

      const duplicate = masterRegistryRecords.some((record) => normalizePanelKey(record.scientific_name) === normalizePanelKey(scientificName));
      if (duplicate) {
        setFeedback(`Organism "${scientificName}" already exists.`, true);
        return;
      }

      const nextRecord = sanitizeRegistryRecord({
        id: buildLocalId("mr-org"),
        scientific_name: scientificName,
        common_name: commonName,
        type,
        ncbi_tax_id: ncbiTaxId ? Number(ncbiTaxId) : null,
        synonyms,
        status,
        panels,
      }, masterRegistryRecords.length, new Set(masterRegistryRecords.map((record) => record.id)));

      if (!nextRecord) {
        setFeedback("Unable to create organism record.", true);
        return;
      }

      masterRegistryRecords.push(nextRecord);
      saveMasterRegistryState();
      editorMode = "";
      renderEditor();
      renderToolbar();
      renderRows();
      setFeedback(`Added organism "${scientificName}".`);
      return;
    }

    if (formMode === "genes") {
      const gene = String(form.querySelector('[name="gene"]')?.value || "").trim();
      const resistanceClass = String(form.querySelector('[name="resistanceClass"]')?.value || "").trim();
      const status = String(form.querySelector('[name="status"]')?.value || "active").trim() || "active";
      const aliases = parseCommaValues(form.querySelector('[name="aliases"]')?.value || "");
      const panels = normalizePanelLabels(form.querySelector('[name="panels"]')?.value || "");

      if (!gene || !resistanceClass) {
        setFeedback("Gene and resistance class are required.", true);
        return;
      }

      const duplicate = masterResistanceGeneCatalog.some((record) => normalizePanelKey(record.gene) === normalizePanelKey(gene));
      if (duplicate) {
        setFeedback(`Gene "${gene}" already exists.`, true);
        return;
      }

      const nextRecord = sanitizeResistanceGeneRecord({
        gene,
        resistanceClass,
        aliases,
        status,
        panels,
      });

      if (!nextRecord) {
        setFeedback("Unable to create gene record.", true);
        return;
      }

      masterResistanceGeneCatalog.push(nextRecord);
      saveMasterRegistryState();
      editorMode = "";
      renderEditor();
      renderToolbar();
      renderRows();
      setFeedback(`Added antibiotic resistance gene "${gene}".`);
      return;
    }

    const code = String(form.querySelector('[name="code"]')?.value || "").trim();
    const description = String(form.querySelector('[name="description"]')?.value || "").trim();
    if (!code || !description) {
      setFeedback("ICD code and description are required.", true);
      return;
    }

    const nextIcdRecord = sanitizeIcdCatalogRecord({ code, description });
    if (!nextIcdRecord) {
      setFeedback("Unable to create ICD code record.", true);
      return;
    }

    const existingIcdRecord = getIcdCatalogRecord(nextIcdRecord.code);
    if (existingIcdRecord) {
      setFeedback(`ICD code "${existingIcdRecord.formattedCode || formatIcdCode(existingIcdRecord.code)}" already exists.`, true);
      return;
    }

    customIcdCatalog.push(nextIcdRecord);
    customIcdCatalog.sort((left, right) => compareIcdCodes(left.code, right.code));
    rebuildIcdCatalogState();
    saveMasterRegistryState();
    addIcdCodeToAllPanels(nextIcdRecord.code, { persist: true });
    editorMode = "";
    renderEditor();
    renderToolbar();
    renderRows();
    setFeedback(`Added ICD code "${getIcdDisplayCode(nextIcdRecord.code)}" and mapped it to all panels.`);
  });

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const next = String(button.getAttribute("data-mr-tab") || "").trim();
      if (!next || next === activeTab) return;
      activeTab = next;
      editorMode = "";
      setFeedback("");
      renderTabs();
      renderToolbar();
      renderEditor();
      renderRows();
    });
  });

  renderTabs();
  renderToolbar();
  renderEditor();
  renderRows();
}

function renderPanelMaster() {
  panelBody.innerHTML = `
    <section class="master-registry-page">
      <div class="master-registry-toolbar pm-toolbar">
        <label class="mr-field mr-wide">
          <span>Search Panel</span>
          <input id="pm-search" placeholder="Search panel name, alias, id, ICD code, prefix, or organism">
        </label>
        <div class="pm-toolbar-actions">
          <button type="button" id="pm-add-panel-btn" class="btn-primary">Add Panel</button>
        </div>
      </div>

      <div id="pm-summary" class="master-registry-summary"></div>
      <p id="pm-feedback" class="pm-feedback hidden"></p>
      <section id="pm-editor" class="pm-editor hidden"></section>

      <div class="master-registry-table-wrap">
        <table class="master-registry-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Panel Name</th>
              <th>Alias</th>
              <th>Price</th>
              <th>ICD Codes</th>
              <th>Prefix</th>
              <th>Actions</th>
              <th>Organisms</th>
            </tr>
          </thead>
          <tbody id="pm-table-body"></tbody>
        </table>
      </div>
    </section>
  `;

  const searchInput = document.getElementById("pm-search");
  const addPanelBtn = document.getElementById("pm-add-panel-btn");
  const summaryNode = document.getElementById("pm-summary");
  const feedbackNode = document.getElementById("pm-feedback");
  const editorNode = document.getElementById("pm-editor");
  const bodyNode = document.getElementById("pm-table-body");
  let panelSearch = "";
  let expandedPanelId = "";
  let editorMode = "";
  let editorPanelId = "";
  let organismEditorMode = "";
  let organismRemoveMode = false;

  const panelOrganismAliasesById = {
    "uti-pcr-panel": [
      "Urinary Tract Infection Panel",
      "Urinary Tract Infection PCR Panel",
      "UTI PCR Panel",
      "UTI Panel",
    ],
    "sti-panel": [
      "Sexually Transmitted Infection Panel",
      "STI Panel",
    ],
    "eye-panel": [
      "Eye Infection Panel",
      "Eye Panel",
    ],
    "respiratory-pathogens-panel": [
      "Respiratory Pathogen Panel",
      "Respiratory Pathogens Panel",
      "Respiratory Panel",
    ],
    "wound-panel": [
      "Wound Infection Panel",
      "Wound Panel",
    ],
    "womens-health-panel": [
      "Women's Health Panel",
      "Womens Health Panel",
    ],
    "gastrointestinal-panel": [
      "Gastrointestinal Infection Panel",
      "Gastrointestinal Panel",
      "GI Panel",
    ],
  };

  function setFeedback(message, isError = false) {
    const text = String(message || "").trim();
    if (!text) {
      feedbackNode.textContent = "";
      feedbackNode.classList.add("hidden");
      feedbackNode.classList.remove("error");
      return;
    }
    feedbackNode.textContent = text;
    feedbackNode.classList.remove("hidden");
    feedbackNode.classList.toggle("error", Boolean(isError));
  }

  function parsePrice(raw) {
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  }

  function parseIcdCodes(raw) {
    return normalizeIcdCodeList(raw);
  }

  function serializeIcdCodes(codes) {
    return parseIcdCodes(codes).join(",");
  }

  function resolveIcdCodeFromInput(input) {
    const canonical = normalizeIcdCode(input);
    if (canonical && getIcdCatalogRecord(canonical)) return canonical;

    const token = String(input || "").trim();
    if (!token) return "";
    const matches = icdCatalogSearchRows.filter((item) => matchesIcdSearch(item, token));
    return matches.length === 1 ? matches[0].code : "";
  }

  function buildIcdSelectedChipsMarkup(codes) {
    if (!codes.length) return '<p class="subtle">No ICD codes selected.</p>';
    return `
      <div class="pm-icd-selected-list">
        ${codes
          .map((code) => {
            const record = getIcdCatalogRecord(code);
            const label = record?.formattedCode || formatIcdCode(code);
            const description = String(record?.description || "").trim();
            return `
            <span class="pm-icd-selected-chip">
              <span title="${escapeHtml(description || label)}">${escapeHtml(label)}</span>
              <button type="button" data-pm-icd-remove data-code="${escapeHtml(code)}" aria-label="Remove ICD code ${escapeHtml(label)}">x</button>
            </span>
          `;
          })
          .join("")}
      </div>
    `;
  }

  function buildIcdSuggestionsMarkup(selectedCodes, query) {
    const selected = new Set(selectedCodes);
    const matches = icdCatalogSearchRows
      .filter((item) => !selected.has(item.code))
      .filter((item) => matchesIcdSearch(item, query))
      .slice(0, 8);

    if (!matches.length) return '<p class="subtle">No matching ICD suggestions.</p>';
    return `
      <div class="pm-icd-suggestion-list">
        ${matches
          .map((item) => `
            <button type="button" class="pm-icd-suggestion-btn" data-pm-icd-suggest data-code="${escapeHtml(item.code)}">
              <span class="mono">${escapeHtml(item.formattedCode || formatIcdCode(item.code))}</span>
              <span>${escapeHtml(item.description || "-")}</span>
            </button>
          `)
          .join("")}
      </div>
    `;
  }

  function readEditorIcdCodes(form) {
    const hidden = form.querySelector('[name="icdCodes"]');
    return parseIcdCodes(hidden?.value || "");
  }

  function writeEditorIcdCodes(form, codes) {
    const hidden = form.querySelector('[name="icdCodes"]');
    if (hidden) hidden.value = serializeIcdCodes(codes);
    const selectedNode = form.querySelector("[data-pm-icd-selected]");
    if (selectedNode) selectedNode.innerHTML = buildIcdSelectedChipsMarkup(parseIcdCodes(codes));
  }

  function refreshEditorIcdSuggestions(form) {
    const searchInput = form.querySelector("[data-pm-icd-search]");
    const suggestionNode = form.querySelector("[data-pm-icd-suggestions]");
    if (!searchInput || !suggestionNode) return;
    const selectedCodes = readEditorIcdCodes(form);
    suggestionNode.innerHTML = buildIcdSuggestionsMarkup(selectedCodes, searchInput.value);
  }

  function addIcdCodeToEditor(form, rawCode) {
    const code = resolveIcdCodeFromInput(rawCode);
    if (!code) {
      setFeedback("Pick a valid ICD code from the list.", true);
      return false;
    }

    const selectedCodes = readEditorIcdCodes(form);
    if (selectedCodes.includes(code)) {
      setFeedback(`ICD code "${getIcdDisplayCode(code)}" is already selected.`);
      return false;
    }

    selectedCodes.push(code);
    selectedCodes.sort(compareIcdCodes);
    writeEditorIcdCodes(form, selectedCodes);

    const searchInput = form.querySelector("[data-pm-icd-search]");
    if (searchInput) searchInput.value = "";
    refreshEditorIcdSuggestions(form);
    setFeedback(`Added ICD code "${getIcdDisplayCode(code)}".`);
    return true;
  }

  function getPanelById(panelId) {
    return orderPanelCatalog.find((panel) => panel.id === panelId) || null;
  }

  function getRegistryRecordById(recordId) {
    return masterRegistryRecords.find((record) => record.id === recordId) || null;
  }

  function getPanelMatchTokens(panel) {
    const tokens = new Set();
    [panel.id, panel.name, panel.alias, ...(panelOrganismAliasesById[panel.id] || [])]
      .forEach((value) => {
        const token = normalizePanelKey(value);
        if (token) tokens.add(token);
      });
    return tokens;
  }

  function removePanelLabelsFromRecord(record, panelLike) {
    const panelTokens = getPanelMatchTokens(panelLike);
    const labels = Array.isArray(record.panels) ? record.panels : [];
    record.panels = labels.filter((label) => !panelTokens.has(normalizePanelKey(label)));
  }

  function addPanelLabelToRecord(record, panel) {
    removePanelLabelsFromRecord(record, panel);
    const next = Array.isArray(record.panels) ? record.panels.slice() : [];
    next.push(panel.name);
    record.panels = Array.from(new Set(next.map((item) => String(item || "").trim()).filter(Boolean)));
  }

  function hasPanelLabelInRecord(record, panelLike) {
    const panelTokens = getPanelMatchTokens(panelLike);
    const labels = Array.isArray(record.panels) ? record.panels : [];
    return labels.some((label) => panelTokens.has(normalizePanelKey(label)));
  }

  function remapPanelLabelAcrossRegistry(previousPanel, nextPanel) {
    const previousTokens = getPanelMatchTokens(previousPanel);
    masterRegistryRecords.forEach((record) => {
      const labels = Array.isArray(record.panels) ? record.panels : [];
      const hadLink = labels.some((label) => previousTokens.has(normalizePanelKey(label)));
      if (!hadLink) return;
      const cleaned = labels.filter((label) => !previousTokens.has(normalizePanelKey(label)));
      cleaned.push(nextPanel.name);
      record.panels = Array.from(new Set(cleaned.map((item) => String(item || "").trim()).filter(Boolean)));
    });
  }

  function removePanelFromRegistryMappings(panel) {
    masterRegistryRecords.forEach((record) => {
      removePanelLabelsFromRecord(record, panel);
    });
  }

  function getPanelOrganismRecords(panel) {
    const panelTokens = getPanelMatchTokens(panel);
    return masterRegistryRecords
      .filter((record) => {
        const labels = Array.isArray(record.panels) ? record.panels : [];
        return labels.some((label) => panelTokens.has(normalizePanelKey(label)));
      })
      .slice()
      .sort((a, b) => String(a.scientific_name || "").localeCompare(String(b.scientific_name || "")));
  }

  function findExistingRegistryRecordByName(scientificName) {
    const token = normalizePanelKey(scientificName);
    if (!token) return null;
    return masterRegistryRecords.find((record) => {
      const values = [
        record.scientific_name,
        record.common_name,
        ...(Array.isArray(record.synonyms) ? record.synonyms : []),
      ];
      return values.some((value) => normalizePanelKey(value) === token);
    }) || null;
  }

  function buildOrganismFormMarkup(panel) {
    const scientificSuggestions = Array.from(
      new Set(
        masterRegistryRecords
          .map((item) => String(item.scientific_name || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    const suggestionListId = `pm-organism-scientific-options-${panel.id}`;

    return `
      <div class="pm-organism-editor">
        <h5>Add Organism to ${escapeHtml(panel.name)}</h5>
        <form class="pm-organism-editor-form" data-pm-org-form data-panel-id="${escapeHtml(panel.id)}">
          <label class="mr-field pm-organism-form-span">
            <span>Organism (from Master Registry) *</span>
            <input name="scientificName" list="${escapeHtml(suggestionListId)}" required placeholder="Select organism from Master Registry">
          </label>
          <datalist id="${escapeHtml(suggestionListId)}">
            ${scientificSuggestions.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}
          </datalist>
          <div class="pm-organism-editor-actions pm-organism-form-span">
            <button type="button" class="btn-ghost" data-pm-org-action="cancel-editor" data-panel-id="${escapeHtml(panel.id)}">Cancel</button>
            <button type="submit" class="btn-primary">Add Organism</button>
          </div>
        </form>
      </div>
    `;
  }

  function buildOrganismDetailMarkup(panel, records) {
    const showAddEditor = expandedPanelId === panel.id && organismEditorMode === "add";
    const showRemoveControls = expandedPanelId === panel.id && organismRemoveMode;
    return `
      <div class="pm-organism-head">
        <div>
          <strong>Organisms (${records.length})</strong>
        </div>
        <div class="pm-organism-head-actions">
          <button type="button" class="btn-ghost pm-row-btn" data-pm-org-action="show-add" data-panel-id="${escapeHtml(panel.id)}">Add Organism</button>
          <button
            type="button"
            class="btn-ghost pm-row-btn pm-remove-toggle ${showRemoveControls ? "is-active" : ""}"
            data-pm-org-action="toggle-remove-mode"
            data-panel-id="${escapeHtml(panel.id)}"
            aria-pressed="${showRemoveControls ? "true" : "false"}"
          >
            Remove Organism
          </button>
        </div>
      </div>
      ${showAddEditor ? buildOrganismFormMarkup(panel) : ""}
      <div class="pm-organism-list">
        ${
          records.length
            ? records
                .map((record) => `
                  <article class="pm-organism-sticker pm-organism-type-${escapeHtml(normalizePanelIdValue(record.type || "other"))}">
                    ${showRemoveControls
                      ? `
                        <button
                          type="button"
                          class="pm-organism-sticker-remove"
                          data-pm-org-action="remove"
                          data-panel-id="${escapeHtml(panel.id)}"
                          data-record-id="${escapeHtml(record.id)}"
                          aria-label="Remove ${escapeHtml(record.scientific_name || "organism")} from ${escapeHtml(panel.name)}"
                          title="Remove from panel"
                        >
                          x
                        </button>
                      `
                      : ""
                    }
                    <strong class="pm-organism-sticker-name">${escapeHtml(record.scientific_name || "-")}</strong>
                    <div class="pm-organism-sticker-meta">
                      <span class="pm-organism-common">${escapeHtml(record.common_name || "No common name")}</span>
                      <span class="pm-organism-badge">${escapeHtml(record.type || "other")}</span>
                      <span class="pm-organism-badge">${escapeHtml(record.status || "active")}</span>
                    </div>
                  </article>
                `)
                .join("")
            : '<p class="subtle">No organisms linked to this panel.</p>'
        }
      </div>
    `;
  }

  function resetOrganismEditor() {
    organismEditorMode = "";
    organismRemoveMode = false;
  }

  function renderEditor() {
    if (!editorMode) {
      editorNode.classList.add("hidden");
      editorNode.innerHTML = "";
      return;
    }

    const isCreate = editorMode === "create";
    const panel = isCreate
      ? { id: "", name: "", alias: "", price: 0, icdCodes: [] }
      : getPanelById(editorPanelId);
    if (!panel) {
      editorMode = "";
      editorPanelId = "";
      editorNode.classList.add("hidden");
      editorNode.innerHTML = "";
      return;
    }

    const selectedIcdCodes = parseIcdCodes(Array.isArray(panel.icdCodes) ? panel.icdCodes : []);

    editorNode.classList.remove("hidden");
    editorNode.innerHTML = `
      <div class="pm-editor-head">
        <h4>${isCreate ? "Add New Panel" : `Edit Panel: ${escapeHtml(panel.name)}`}</h4>
        <p>${isCreate ? "Create a panel definition for ordering and reporting." : "Update panel details and mapping metadata."}</p>
      </div>
      <form id="pm-editor-form" class="pm-editor-form" data-mode="${isCreate ? "create" : "edit"}" data-panel-id="${escapeHtml(panel.id)}">
        <label class="mr-field">
          <span>Panel Name *</span>
          <input name="name" required value="${escapeHtml(panel.name)}" placeholder="e.g. Antibiotic Resistance Panel">
        </label>
        <label class="mr-field">
          <span>Alias</span>
          <input name="alias" value="${escapeHtml(panel.alias || panel.name || "")}" placeholder="Optional alias">
        </label>
        <label class="mr-field">
          <span>Panel ID ${isCreate ? "(optional)" : ""}</span>
          <input name="panelId" value="${escapeHtml(panel.id)}" ${isCreate ? "" : "readonly"} placeholder="auto from panel name">
        </label>
        <label class="mr-field">
          <span>Prefix</span>
          <input name="prefix" value="${escapeHtml(panelAccessionPrefixById[panel.id] || "")}" maxlength="6" placeholder="e.g. UT">
        </label>
        <label class="mr-field">
          <span>Price</span>
          <input name="price" type="number" min="0" step="0.01" value="${escapeHtml(Number(panel.price || 0).toFixed(2))}">
        </label>
        <section class="pm-editor-span pm-icd-editor" aria-label="ICD codes">
          <label class="mr-field">
            <span>ICD Codes</span>
            <div class="pm-icd-editor-controls">
              <input
                data-pm-icd-search
                placeholder="Search ICD code or description (N39.0 or N390)"
              >
              <button type="button" class="btn-ghost pm-row-btn" data-pm-icd-add>Add</button>
            </div>
          </label>
          <input type="hidden" name="icdCodes" value="${escapeHtml(serializeIcdCodes(selectedIcdCodes))}">
          <div data-pm-icd-selected>${buildIcdSelectedChipsMarkup(selectedIcdCodes)}</div>
          <div class="pm-icd-suggestions" data-pm-icd-suggestions>${buildIcdSuggestionsMarkup(selectedIcdCodes, "")}</div>
        </section>
        <div class="pm-editor-actions pm-editor-span">
          <button type="button" class="btn-ghost" data-pm-editor-cancel>Cancel</button>
          ${
            isCreate
              ? ""
              : `<button type="button" class="btn-ghost pm-editor-remove" data-pm-editor-remove data-panel-id="${escapeHtml(panel.id)}">Remove Panel</button>`
          }
          <button type="submit" class="btn-primary">${isCreate ? "Add Panel" : "Save Panel"}</button>
        </div>
      </form>
    `;
  }

  function renderRows() {
    const query = panelSearch.trim().toLowerCase();
    const rowsWithOrganisms = orderPanelCatalog
      .map((row) => ({ row, organisms: getPanelOrganismRecords(row) }))
      .filter(({ row, organisms }) => {
        if (!query) return true;
        const prefix = panelAccessionPrefixById[row.id] || "";
        const haystack = [
          row.id,
          row.name,
          row.alias,
          buildIcdSearchValues(row.icdCodes),
          prefix,
          String(row.price ?? ""),
          organisms.map((record) => [record.scientific_name, record.common_name, (record.synonyms || []).join(" ")].join(" ")).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice()
      .sort((a, b) => a.row.name.localeCompare(b.row.name));

    const totalIcdCodes = rowsWithOrganisms.reduce((sum, item) => sum + item.row.icdCodes.length, 0);
    const prefixedPanels = rowsWithOrganisms.filter((item) => Boolean(panelAccessionPrefixById[item.row.id])).length;
    const mappedPanels = rowsWithOrganisms.filter((item) => item.organisms.length > 0).length;

    summaryNode.innerHTML = `
      <div class="mr-stat"><strong>${rowsWithOrganisms.length}</strong><span>panels</span></div>
      <div class="mr-stat"><strong>${totalIcdCodes}</strong><span>ICD mappings</span></div>
      <div class="mr-stat"><strong>${prefixedPanels}</strong><span>with prefix</span></div>
      <div class="mr-stat"><strong>${mappedPanels}</strong><span>with organisms</span></div>
    `;

    if (!rowsWithOrganisms.length) {
      bodyNode.innerHTML = `<tr><td colspan="8" class="table-empty">No panels found.</td></tr>`;
      return;
    }

    bodyNode.innerHTML = rowsWithOrganisms
      .map(({ row, organisms }) => {
        const codes = normalizeIcdCodeList(Array.isArray(row.icdCodes) ? row.icdCodes : []).sort(compareIcdCodes);
        const codeStickers = codes.length
          ? `
            <div class="pm-icd-sticker-list">
              ${codes
                .map((code) => `<span class="pm-icd-sticker">${escapeHtml(getIcdDisplayCode(code))}</span>`)
                .join("")}
            </div>
          `
          : "-";
        const prefix = panelAccessionPrefixById[row.id] || "-";
        const price = Number(row.price || 0).toFixed(2);
        const organismCount = organisms.length;
        const detailId = `pm-detail-${row.id}`;
        const expanded = expandedPanelId === row.id;
        return `
          <tr>
            <td class="mono">${escapeHtml(row.id)}</td>
            <td><strong>${escapeHtml(row.name)}</strong></td>
            <td>${escapeHtml(row.alias || "-")}</td>
            <td>$${escapeHtml(price)}</td>
            <td>${codeStickers}</td>
            <td class="mono">${escapeHtml(prefix)}</td>
            <td>
              <div class="pm-row-actions">
                <button type="button" class="btn-ghost pm-row-btn" data-pm-action="edit-panel" data-panel-id="${escapeHtml(row.id)}">Edit</button>
              </div>
            </td>
            <td>
              <button
                type="button"
                class="btn-ghost pm-expand-btn"
                data-panel-toggle-id="${escapeHtml(row.id)}"
                data-organism-count="${organismCount}"
                aria-expanded="${expanded ? "true" : "false"}"
                aria-controls="${escapeHtml(detailId)}"
              >
                ${expanded ? "Hide" : `Show (${organismCount})`}
              </button>
            </td>
          </tr>
          <tr id="${escapeHtml(detailId)}" class="pm-organism-detail-row ${expanded ? "" : "hidden"}" data-panel-detail-id="${escapeHtml(row.id)}">
            <td colspan="8">
              ${buildOrganismDetailMarkup(row, organisms)}
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function removePanelById(panelId) {
    const panel = getPanelById(panelId);
    if (!panel) {
      setFeedback("Unable to locate panel for removal.", true);
      return false;
    }
    const shouldRemove = window.confirm(`Remove panel "${panel.name}"? This cannot be undone.`);
    if (!shouldRemove) return false;

    const index = orderPanelCatalog.findIndex((row) => row.id === panelId);
    if (index < 0) {
      setFeedback("Unable to locate panel for removal.", true);
      return false;
    }

    orderPanelCatalog.splice(index, 1);
    delete panelAccessionPrefixById[panelId];
    removePanelFromRegistryMappings(panel);
    savePanelCatalogState();
    saveMasterRegistryState();

    if (expandedPanelId === panelId) expandedPanelId = "";
    if (editorPanelId === panelId) {
      editorMode = "";
      editorPanelId = "";
    }

    resetOrganismEditor();
    renderEditor();
    renderRows();
    setFeedback(`Removed panel "${panel.name}".`);
    return true;
  }

  addPanelBtn.addEventListener("click", () => {
    editorMode = "create";
    editorPanelId = "";
    setFeedback("");
    renderEditor();
  });

  editorNode.addEventListener("click", (event) => {
    const form = event.target.closest("#pm-editor-form");

    const icdAddBtn = event.target.closest("[data-pm-icd-add]");
    if (icdAddBtn && form) {
      const searchInput = form.querySelector("[data-pm-icd-search]");
      addIcdCodeToEditor(form, searchInput?.value || "");
      return;
    }

    const icdSuggestBtn = event.target.closest("[data-pm-icd-suggest]");
    if (icdSuggestBtn && form) {
      const code = String(icdSuggestBtn.getAttribute("data-code") || "").trim();
      if (!code) return;
      addIcdCodeToEditor(form, code);
      return;
    }

    const icdRemoveBtn = event.target.closest("[data-pm-icd-remove]");
    if (icdRemoveBtn && form) {
      const code = String(icdRemoveBtn.getAttribute("data-code") || "").trim();
      if (!code) return;
      const nextCodes = readEditorIcdCodes(form).filter((item) => item !== code);
      writeEditorIcdCodes(form, nextCodes);
      refreshEditorIcdSuggestions(form);
      setFeedback(`Removed ICD code "${getIcdDisplayCode(code)}".`);
      return;
    }

    const cancelBtn = event.target.closest("[data-pm-editor-cancel]");
    if (cancelBtn) {
      editorMode = "";
      editorPanelId = "";
      renderEditor();
      return;
    }

    const removeBtn = event.target.closest("[data-pm-editor-remove]");
    if (!removeBtn) return;
    const panelId = String(removeBtn.getAttribute("data-panel-id") || "");
    if (!panelId) return;
    removePanelById(panelId);
  });

  editorNode.addEventListener("input", (event) => {
    const searchInput = event.target.closest("[data-pm-icd-search]");
    if (!searchInput) return;
    const form = searchInput.closest("#pm-editor-form");
    if (!form) return;
    refreshEditorIcdSuggestions(form);
  });

  editorNode.addEventListener("keydown", (event) => {
    const searchInput = event.target.closest("[data-pm-icd-search]");
    if (!searchInput || event.key !== "Enter") return;
    const form = searchInput.closest("#pm-editor-form");
    if (!form) return;
    event.preventDefault();
    addIcdCodeToEditor(form, searchInput.value);
  });

  editorNode.addEventListener("submit", (event) => {
    if (!event.target.matches("#pm-editor-form")) return;
    event.preventDefault();
    const form = event.target;
    const mode = form.getAttribute("data-mode") || "";
    const name = String(form.querySelector('[name="name"]')?.value || "").trim();
    if (!name) {
      setFeedback("Panel name is required.", true);
      return;
    }

    const alias = String(form.querySelector('[name="alias"]')?.value || name).trim() || name;
    const icdCodes = parseIcdCodes(form.querySelector('[name="icdCodes"]')?.value || "");
    const price = parsePrice(form.querySelector('[name="price"]')?.value);
    const prefix = String(form.querySelector('[name="prefix"]')?.value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);

    if (mode === "create") {
      const requestedId = String(form.querySelector('[name="panelId"]')?.value || "").trim();
      const rawPanelId = requestedId || makePanelIdFromName(name);
      const basePanelId = normalizePanelIdValue(rawPanelId);
      if (!basePanelId) {
        setFeedback("Unable to derive a valid panel ID. Enter a Panel ID manually.", true);
        return;
      }

      const usedIds = new Set(orderPanelCatalog.map((panel) => panel.id));
      const panelId = makeUniquePanelId(basePanelId, usedIds);
      orderPanelCatalog.push({
        id: panelId,
        name,
        alias,
        price,
        icdCodes,
      });
      if (prefix) panelAccessionPrefixById[panelId] = prefix;
      else delete panelAccessionPrefixById[panelId];

      syncAllPanelsToCatalogIcdCodes();
      savePanelCatalogState();
      editorMode = "";
      editorPanelId = "";
      renderEditor();
      renderRows();
      setFeedback(`Added panel "${name}".`);
      return;
    }

    const panelId = String(form.getAttribute("data-panel-id") || "");
    const panel = getPanelById(panelId);
    if (!panel) {
      setFeedback("Unable to locate panel for edit.", true);
      editorMode = "";
      editorPanelId = "";
      renderEditor();
      renderRows();
      return;
    }

    const previousPanel = {
      id: panel.id,
      name: panel.name,
      alias: panel.alias,
    };

    panel.name = name;
    panel.alias = alias;
    panel.price = price;
    panel.icdCodes = icdCodes;
    if (prefix) panelAccessionPrefixById[panel.id] = prefix;
    else delete panelAccessionPrefixById[panel.id];
    remapPanelLabelAcrossRegistry(previousPanel, panel);

    syncAllPanelsToCatalogIcdCodes();
    savePanelCatalogState();
    saveMasterRegistryState();
    editorMode = "";
    editorPanelId = "";
    renderEditor();
    renderRows();
    setFeedback(`Saved panel "${name}".`);
  });

  bodyNode.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-pm-org-form]");
    if (!form) return;
    event.preventDefault();

    const panelId = String(form.getAttribute("data-panel-id") || "");
    const panel = getPanelById(panelId);
    if (!panel) {
      setFeedback("Unable to locate panel for organism update.", true);
      return;
    }

    const scientificName = String(form.querySelector('[name="scientificName"]')?.value || "").trim();
    if (!scientificName) {
      setFeedback("Scientific name is required.", true);
      return;
    }

    const existing = findExistingRegistryRecordByName(scientificName);
    if (!existing) {
      setFeedback(`"${scientificName}" is not in Master Registry. Add it there first, then map it to "${panel.name}".`, true);
      return;
    }

    if (hasPanelLabelInRecord(existing, panel)) {
      setFeedback(`"${existing.scientific_name}" is already mapped to "${panel.name}".`);
      resetOrganismEditor();
      renderRows();
      return;
    }

    addPanelLabelToRecord(existing, panel);
    saveMasterRegistryState();
    resetOrganismEditor();
    renderRows();
    setFeedback(`Mapped "${existing.scientific_name}" to "${panel.name}".`);
  });

  bodyNode.addEventListener("click", (event) => {
    const panelActionBtn = event.target.closest("[data-pm-action]");
    if (panelActionBtn) {
      const action = panelActionBtn.getAttribute("data-pm-action") || "";
      const panelId = panelActionBtn.getAttribute("data-panel-id") || "";
      if (!panelId) return;
      const panel = getPanelById(panelId);
      if (!panel) return;

      if (action === "edit-panel") {
        editorMode = "edit";
        editorPanelId = panelId;
        setFeedback("");
        renderEditor();
        return;
      }

      if (action === "remove-panel") {
        removePanelById(panelId);
      }
      return;
    }

    const orgActionBtn = event.target.closest("[data-pm-org-action]");
    if (orgActionBtn) {
      const action = orgActionBtn.getAttribute("data-pm-org-action") || "";
      const panelId = orgActionBtn.getAttribute("data-panel-id") || "";
      const panel = getPanelById(panelId);
      if (!panel) return;

      if (action === "show-add") {
        expandedPanelId = panel.id;
        organismEditorMode = "add";
        organismRemoveMode = false;
        renderRows();
        return;
      }

      if (action === "toggle-remove-mode") {
        expandedPanelId = panel.id;
        organismRemoveMode = !organismRemoveMode;
        if (organismRemoveMode) organismEditorMode = "";
        renderRows();
        return;
      }

      if (action === "cancel-editor") {
        resetOrganismEditor();
        renderRows();
        return;
      }

      if (action === "remove") {
        const recordId = orgActionBtn.getAttribute("data-record-id") || "";
        if (!recordId) return;
        const record = getRegistryRecordById(recordId);
        if (!record) return;
        const shouldRemove = window.confirm(`Remove "${record.scientific_name}" from "${panel.name}"?`);
        if (!shouldRemove) return;
        removePanelLabelsFromRecord(record, panel);
        saveMasterRegistryState();
        renderRows();
        setFeedback(`Removed organism "${record.scientific_name}" from "${panel.name}".`);
      }
      return;
    }

    const toggleBtn = event.target.closest("[data-panel-toggle-id]");
    if (!toggleBtn) return;
    const panelId = toggleBtn.getAttribute("data-panel-toggle-id") || "";
    if (!panelId) return;
    if (expandedPanelId === panelId) {
      expandedPanelId = "";
      resetOrganismEditor();
    } else {
      expandedPanelId = panelId;
      resetOrganismEditor();
    }
    renderRows();
  });

  searchInput.addEventListener("input", () => {
    panelSearch = searchInput.value;
    renderRows();
  });

  renderEditor();
  renderRows();
}

function getReportFormulasApi() {
  if (typeof window === "undefined") return null;
  return window.LabCenterReportFormulas || null;
}

function getFormulaBookApi() {
  if (typeof window === "undefined") return null;
  return window.LabCenterFormulaBook || null;
}

function isSarsCov2FinalReportFormulaEnabled() {
  const enabled = getReportFormulasApi()?.isSarsCov2FinalReportFormulaEnabled?.();
  return enabled !== false;
}

function getSarsCov2FinalReportFormulaConfig() {
  const formula = getFormulaBookApi()?.getSarsCov2FinalReportFormulaConfig?.()
    || getReportFormulasApi()?.getSarsCov2FinalReportFormula?.();
  if (formula) return formula;

  return {
    key: "sars-cov-2-final-report",
    title: "SARS-CoV-2 Final Report Formula",
    pathogenLabel: "SARS-CoV-2",
    reportType: "finalReport",
    enabled: true,
    statusLabel: "Enabled",
    thresholdCt: 33,
    minimumPositiveTargets: 2,
    targets: [
      { key: "e", label: "E Gene" },
      { key: "n", label: "N Gene" },
      { key: "orf1ab", label: "Orf1ab" },
    ],
    placeholder: [
      "IF COUNT(E Gene Ct <= 33, N Gene Ct <= 33, Orf1ab Ct <= 33) >= 2",
      "THEN SARS-CoV-2 = Positive",
      "ELSE SARS-CoV-2 = Negative",
    ].join("\n"),
  };
}

function isRnasepHiddenOnFinalReport(pathogenName) {
  const hidden = getReportFormulasApi()?.isRnasepHiddenOnFinalReport?.(pathogenName);
  if (typeof hidden === "boolean") return hidden;
  const normalized = normalizeReportKey(pathogenName);
  return normalized === "rnasep" || normalized === "humanrnasep";
}

function normalizeFinalReportResult(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.includes("inconclusive")) return "Not Detected";
  return value;
}

function normalizeFinalReportRow(row) {
  if (!row || typeof row !== "object") return row;
  const normalizedResult = normalizeFinalReportResult(row.result);
  return normalizedResult === row.result ? { ...row } : { ...row, result: normalizedResult };
}

function filterFinalReportRows(rows) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const filteredRows = getReportFormulasApi()?.filterFinalReportRows?.(normalizedRows);
  if (Array.isArray(filteredRows)) return filteredRows;
  return normalizedRows
    .filter((row) => !isRnasepHiddenOnFinalReport(row?.pathogen || row?.target))
    .map((row) => normalizeFinalReportRow(row));
}

function renderFormulaBook() {
  const api = getFormulaBookApi();
  if (!api?.renderFormulaBookView) {
    panelBody.innerHTML = `
      <section class="master-registry-page formula-book-page">
        <section class="formula-book-card">
          <section class="formula-book-empty">
            <h4>Formula Book is unavailable</h4>
            <p>The Formula Book module could not be loaded. Refresh the page and try again.</p>
          </section>
        </section>
      </section>
    `;
    return;
  }

  const nextState = api.renderFormulaBookView({
    panelBody,
    state: formulaBookState,
    escapeHtml,
    onStateChange(updatedState) {
      formulaBookState = { ...formulaBookState, ...updatedState };
      renderFormulaBook();
    },
  });

  if (nextState && typeof nextState === "object") {
    formulaBookState = { ...formulaBookState, ...nextState };
  }
}

function renderOutputResults() {
  const outputTabs = [
    { key: "pending-results", label: "Pending Results" },
    { key: "pending-pharmd", label: "Pending PharmD" },
    { key: "completed", label: "Completed" },
    { key: "rejected", label: "Rejected" },
  ];
  let activeTab = outputTabs[0].key;
  let searchQuery = "";
  let outputSortMode = "created-desc";
  let outputTableNode = null;
  let tabsNode = null;
  let publishModalNode = null;
  let publishModalOrderId = "";
  let publishModalView = "menu";
  const publishFaxDisplayNumber = "352-565-4554";
  let publishModalFaxState = {
    orderId: "",
    loading: false,
    recipientFaxNumber: "",
    recipientFaxDigits: "",
    recipientAvailable: false,
    error: "",
  };
  const sendingPharmdOrders = new Set();
  const checkingPharmdOrders = new Set();
  const openingPharmdReceiptOrders = new Set();
  const openingCombinedPharmdOrders = new Set();
  const publishingFaxOrders = new Set();
  const workflowSavingOrders = new Set();
  const previewLoadingOrders = new Set();

  function formatOutputDate(iso) {
    return formatAppDateTime(iso, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }, "-");
  }

  function findOrderById(orderId) {
    return readOrders().find((item) => String(item?.orderId || "").trim() === String(orderId || "").trim()) || null;
  }

  function resolveOrderAccession(order) {
    return resolvePharmdAccession(order) || "-";
  }

  function resolveOutputBucket(order) {
    const status = String(order?.status || "").trim().toLowerCase();
    if (status === "rejected") return "rejected";
    if (order?.publishedReports?.final?.publishedAt || order?.pharmd?.completedAt || order?.completedAt || status === "complete") return "completed";
    if (status === "processed" || status === "validated" || order?.processedResult?.report) return "pending-pharmd";
    return "pending-results";
  }

  function resolveOutputBadgeClass(order) {
    const bucket = resolveOutputBucket(order);
    if (bucket === "completed") return "status-complete";
    if (bucket === "rejected") return "status-rejected";
    if (bucket === "pending-pharmd") return "status-processed";
    return "status-pending";
  }

  function resolveOutputStageLabel(order) {
    const bucket = resolveOutputBucket(order);
    if (bucket === "completed") return "Completed";
    if (bucket === "rejected") return "Rejected";
    if (bucket === "pending-pharmd") return "Pending PharmD";
    return "Pending Results";
  }

  function getTabCount(tabKey) {
    return readOrders().filter((order) => resolveOutputBucket(order) === tabKey).length;
  }

  function resolveOutputLastActivityAt(order) {
    return order?.completedAt
      || order?.pharmd?.completedAt
      || order?.publishedReports?.final?.publishedAt
      || order?.pharmd?.prePublishedAt
      || order?.pharmd?.validationReadyAt
      || order?.updatedAt
      || order?.processedAt
      || order?.createdAt
      || "";
  }

  function resolveOrderCreatedAt(order) {
    return order?.createdAt
      || order?.orderCreatedAt
      || order?.sampleCollectTime
      || order?.processedAt
      || order?.updatedAt
      || "";
  }

  function getOrderSortTimestamp(order, mode) {
    const value = mode.startsWith("activity")
      ? resolveOutputLastActivityAt(order)
      : resolveOrderCreatedAt(order);
    const timestamp = new Date(value || 0).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function compareOutputOrders(a, b) {
    const direction = outputSortMode.endsWith("asc") ? 1 : -1;
    const diff = getOrderSortTimestamp(a, outputSortMode) - getOrderSortTimestamp(b, outputSortMode);
    if (diff) return diff * direction;
    return String(a?.orderId || "").localeCompare(String(b?.orderId || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function getFilteredOrders() {
    const needle = searchQuery.trim().toLowerCase();
    return readOrders()
      .filter((order) => resolveOutputBucket(order) === activeTab)
      .filter((order) => {
        if (!needle) return true;
        const haystack = [
          order?.orderId,
          resolveOrderAccession(order),
          order?.patientName,
          order?.patientId,
          order?.provider,
          order?.facilityName,
          order?.services?.[0]?.serviceName,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");
        return haystack.includes(needle);
      })
      .sort(compareOutputOrders);
  }

  function replaceOrderInState(updatedOrder) {
    if (!updatedOrder?.orderId) return;
    const orders = readOrders();
    const index = orders.findIndex((item) => String(item?.orderId || "").trim() === String(updatedOrder.orderId || "").trim());
    if (index >= 0) orders[index] = updatedOrder;
    else orders.unshift(updatedOrder);
    writeOrders(orders);
  }

  function resetPublishModalFaxState(order = null) {
    const orderId = String(order?.orderId || "").trim();
    const recipientFaxNumber = String(order?.publishedReports?.final?.recipientFaxNumber || "").trim();
    const recipientFaxDigits = String(order?.publishedReports?.final?.recipientFaxDigits || "").trim();
    publishModalFaxState = {
      orderId,
      loading: false,
      recipientFaxNumber,
      recipientFaxDigits,
      recipientAvailable: Boolean(recipientFaxNumber || recipientFaxDigits),
      error: "",
    };
  }

  async function loadCompletedPublishFaxDetails(orderId) {
    const normalizedOrderId = String(orderId || "").trim();
    if (!normalizedOrderId) throw new Error("Order not found.");
    publishModalFaxState = {
      orderId: normalizedOrderId,
      loading: true,
      recipientFaxNumber: "",
      recipientFaxDigits: "",
      recipientAvailable: false,
      error: "",
    };
    renderCompletedPublishModal();
    try {
      const payload = await requestJson(`/api/orders/${encodeURIComponent(normalizedOrderId)}/publish-fax-details`, {
        method: "GET",
      });
      if (publishModalOrderId !== normalizedOrderId) return payload;
      const recipientFaxNumber = String(payload?.recipientFaxNumber || "").trim();
      const recipientFaxDigits = String(payload?.recipientFaxDigits || "").trim();
      const recipientAvailable = Boolean(payload?.recipientAvailable && (recipientFaxNumber || recipientFaxDigits));
      publishModalFaxState = {
        orderId: normalizedOrderId,
        loading: false,
        recipientFaxNumber,
        recipientFaxDigits,
        recipientAvailable,
        error: recipientAvailable ? "" : "Facility fax number is not configured for this order.",
      };
      renderCompletedPublishModal();
      return payload;
    } catch (error) {
      if (publishModalOrderId === normalizedOrderId) {
        publishModalFaxState = {
          orderId: normalizedOrderId,
          loading: false,
          recipientFaxNumber: "",
          recipientFaxDigits: "",
          recipientAvailable: false,
          error: error?.message || "Unable to load fax details.",
        };
        renderCompletedPublishModal();
      }
      throw error;
    }
  }

  function closeCompletedPublishModal() {
    publishModalOrderId = "";
    publishModalView = "menu";
    resetPublishModalFaxState();
    renderCompletedPublishModal();
  }

  function renderCompletedPublishModal() {
    if (!publishModalNode) return;
    const order = publishModalOrderId ? findOrderById(publishModalOrderId) : null;
    const isCompletedOrder = Boolean(order && resolveOutputBucket(order) === "completed");
    if (!isCompletedOrder) {
      publishModalNode.classList.add("hidden");
      publishModalNode.setAttribute("aria-hidden", "true");
      publishModalNode.innerHTML = "";
      syncBodyModalOpenState();
      return;
    }

    const isFaxConfirmView = publishModalView === "fax-confirm";
    const isFaxSending = publishingFaxOrders.has(String(order?.orderId || "").trim());
    const isPharmdBypassed = isPharmdSkipped(order);
    const hasFaxReport = isPharmdBypassed ? hasSavedFinalReport(order) : canPreviewCombinedPharmdReport(order);
    const faxAttachmentName = isPharmdBypassed
      ? String(order?.generatedReports?.final?.fileName || `Order_${order?.orderId || "-"}_Final_Report.pdf`)
      : buildCombinedPharmdPreviewFileName(order?.orderId);
    const orderId = String(order?.orderId || "").trim();
    const lastPublishedFax = order?.publishedReports?.final?.channel === "fax"
      ? order.publishedReports.final
      : null;
    const isFaxDetailsLoading = isFaxConfirmView
      && publishModalFaxState.orderId === orderId
      && publishModalFaxState.loading;
    const recipientFaxNumber = String(
      (publishModalFaxState.orderId === orderId
        ? publishModalFaxState.recipientFaxNumber
        : lastPublishedFax?.recipientFaxNumber) || ""
    ).trim();
    const recipientAvailable = publishModalFaxState.orderId === orderId
      ? Boolean(publishModalFaxState.recipientAvailable)
      : Boolean(recipientFaxNumber);
    const recipientFaxError = publishModalFaxState.orderId === orderId
      ? String(publishModalFaxState.error || "").trim()
      : "";
    const faxReadyToSend = hasFaxReport && recipientAvailable && !isFaxDetailsLoading;
    const lastPublishedCopy = lastPublishedFax?.publishedAt
      ? `Last fax activity ${formatOutputDate(lastPublishedFax.publishedAt)}${lastPublishedFax?.status ? ` • ${String(lastPublishedFax.status).replace(/^\w/, (value) => value.toUpperCase())}` : ""}.`
      : "";

    publishModalNode.classList.remove("hidden");
    publishModalNode.setAttribute("aria-hidden", "false");
    publishModalNode.innerHTML = `
      <div class="output-results-publish-dialog" role="dialog" aria-modal="true" aria-labelledby="output-results-publish-title">
        <div class="output-results-publish-head">
          <div>
            <p class="badge">Completed Report</p>
            <h3 id="output-results-publish-title">Publish Report</h3>
            <p class="subtle output-results-publish-copy">${isFaxConfirmView ? "Review the fax details below and confirm before the report is sent." : "Choose how you want to route this completed report next."}</p>
          </div>
          <button type="button" class="preview-close-btn" data-close-output-publish-modal aria-label="Close publish dialog">&times;</button>
        </div>
        <div class="output-results-publish-body">
          <div class="output-results-publish-meta">
            <div>
              <span>Order #</span>
              <strong>${escapeHtml(order?.orderId || "-")}</strong>
            </div>
            <div>
              <span>Patient</span>
              <strong>${escapeHtml(order?.patientName || "-")}</strong>
            </div>
            <div>
              <span>Accession #</span>
              <strong>${escapeHtml(resolveOrderAccession(order))}</strong>
            </div>
            <div>
              <span>Provider</span>
              <strong>${escapeHtml(order?.provider || "-")}</strong>
            </div>
          </div>
          ${isFaxConfirmView ? `
            <section class="output-results-publish-confirm-card">
              <div class="output-results-publish-confirm-head">
                <div>
                  <p class="badge">Fax Confirmation</p>
                  <h4>Confirm Send Fax</h4>
                </div>
                <span class="history-status ${hasFaxReport ? "status-complete" : "status-pending"}">${hasFaxReport ? "PDF Ready" : "PDF Missing"}</span>
              </div>
              <div class="output-results-publish-route">
                <div>
                  <span>Sender</span>
                  <strong>${escapeHtml(publishFaxDisplayNumber)}</strong>
                </div>
                <div>
                  <span>Receiver</span>
                  <strong>${escapeHtml(isFaxDetailsLoading ? "Loading..." : (recipientFaxNumber || "Unavailable"))}</strong>
                </div>
                <div>
                  <span>Attachment</span>
                  <strong>${escapeHtml(faxAttachmentName)}</strong>
                </div>
              </div>
              <p class="subtle output-results-publish-note">
                ${isFaxDetailsLoading
                  ? "Loading the facility fax number for this order."
                  : !recipientAvailable
                  ? escapeHtml(recipientFaxError || "Facility fax number is not configured for this order.")
                  : hasFaxReport
                  ? (isPharmdBypassed
                    ? "The saved final report will be queued with SRFax after you confirm."
                    : "The combined PharmD PDF you preview will be queued with SRFax after you confirm.")
                  : (isPharmdBypassed
                    ? "A saved final report is required before this fax can be sent."
                    : "Both the saved final report and the PharmD return file are required before this fax can be sent.")}
              </p>
              ${lastPublishedCopy ? `<p class="subtle output-results-publish-history">${escapeHtml(lastPublishedCopy)}</p>` : ""}
            </section>
            <div class="output-results-publish-actions output-results-publish-actions-split">
              <button type="button" class="table-action-btn secondary-btn" data-publish-view="menu" ${isFaxSending ? "disabled" : ""}>Back</button>
              <div class="output-results-publish-action-group">
                <button type="button" class="table-action-btn secondary-btn" data-close-output-publish-modal ${isFaxSending ? "disabled" : ""}>Cancel</button>
                <button
                  type="button"
                  class="table-action-btn publish-report-btn"
                  data-confirm-publish-fax="${escapeHtml(order?.orderId || "")}"
                  ${faxReadyToSend && !isFaxSending ? "" : "disabled"}
                >
                  ${isFaxSending ? "Sending..." : "Confirm Send Fax"}
                </button>
              </div>
            </div>
          ` : `
            <div class="output-results-publish-options">
              <button type="button" class="output-results-publish-choice" data-publish-channel="email">
                <span class="output-results-publish-choice-label">Send Email</span>
                <span class="output-results-publish-choice-copy">Prepare the completed report for email delivery.</span>
              </button>
              <button type="button" class="output-results-publish-choice" data-publish-channel="fax">
                <span class="output-results-publish-choice-label">Send Fax</span>
                <span class="output-results-publish-choice-copy">Review the fax details and confirm before sending the completed report.</span>
              </button>
            </div>
            <div class="output-results-publish-actions">
              <button type="button" class="table-action-btn secondary-btn" data-close-output-publish-modal>Cancel</button>
            </div>
          `}
        </div>
      </div>
    `;
    syncBodyModalOpenState();
  }

  function openCompletedPublishModal(orderId) {
    const order = findOrderById(orderId);
    if (!order) {
      alert("Order not found.");
      return;
    }
    if (resolveOutputBucket(order) !== "completed") {
      alert("Only completed reports can be published from this queue.");
      return;
    }
    publishModalOrderId = String(orderId || "").trim();
    publishModalView = "menu";
    resetPublishModalFaxState(order);
    renderCompletedPublishModal();
  }

  async function sendCompletedReportFax(orderId) {
    const order = findOrderById(orderId);
    if (!order) throw new Error("Order not found.");
    if (isPharmdSkipped(order) && !hasSavedFinalReport(order)) {
      throw new Error("The saved final report is required before a fax can be sent.");
    }
    if (!isPharmdSkipped(order) && !canPreviewCombinedPharmdReport(order)) {
      throw new Error("Both the saved final report and the PharmD return file are required before a fax can be sent.");
    }
    if (!csrfToken) await fetchCsrfToken();
    const payload = await requestJson(`/api/orders/${encodeURIComponent(orderId)}/publish-fax`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        confirmed: true,
      }),
    });
    if (payload?.order) replaceOrderInState(payload.order);
    renderOutputResultsTable();
    renderCompletedPublishModal();
    return payload;
  }

  function resolvePharmdRemotePath(order) {
    const explicit = String(order?.pharmd?.remotePath || "").trim();
    if (explicit) return explicit;
    const remoteDir = String(order?.pharmd?.remoteDir || "oru").trim().replace(/^\/+|\/+$/g, "");
    const fileName = resolvePharmdMessageFileName(order);
    return remoteDir ? `${remoteDir}/${fileName}` : fileName;
  }

  function buildPharmdLogPreview(order) {
    const logs = Array.isArray(order?.pharmd?.logs) ? order.pharmd.logs : [];
    const headerLines = [
      `Order #: ${String(order?.orderId || "-").trim() || "-"}`,
      `Accession #: ${resolveOrderAccession(order)}`,
      `Patient: ${String(order?.patientName || "-").trim() || "-"}`,
      `Status: ${resolvePharmdStatusInfo(order).label}`,
      `Remote Target: ${resolvePharmdRemotePath(order)}`,
      "",
    ];
    if (!logs.length) {
      return `${headerLines.join("\n")}No PharmD connection attempts have been recorded for this order yet.`;
    }
    const logLines = logs.map((entry) => {
      const ts = formatOutputDate(entry?.ts || "");
      const level = String(entry?.level || "info").toUpperCase();
      const step = String(entry?.step || "general").trim() || "general";
      const message = String(entry?.message || "").trim() || "Log entry";
      return `[${ts}] ${level} (${step}) ${message}`;
    });
    return [...headerLines, ...logLines].join("\n");
  }

  function refreshOutputTabCounts() {
    if (!tabsNode) return;
    tabsNode.querySelectorAll("[data-output-tab]").forEach((node) => {
      const countNode = node.querySelector("strong");
      if (countNode) {
        countNode.textContent = String(getTabCount(node.getAttribute("data-output-tab")));
      }
    });
  }

  async function sendPharmdOrder(orderId) {
    const order = findOrderById(orderId);
    if (!order) throw new Error("Order not found.");
    const oruMessage = resolvePharmdOruMessage(order);
    if (!oruMessage) throw new Error("No HL7 ORU message is available for this order yet.");
    if (!csrfToken) await fetchCsrfToken();
    const payload = await requestJson(`/api/pharmd/orders/${encodeURIComponent(orderId)}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        oruMessage,
        fileName: resolvePharmdMessageFileName(order),
      }),
    });
    if (payload?.order) replaceOrderInState(payload.order);
    renderOutputResultsTable();
    if (!payload?.ok) {
      throw new Error(payload?.message || "Unable to send PharmD HL7 file.");
    }
    return payload;
  }

  async function checkPharmdReceipt(orderId) {
    const order = findOrderById(orderId);
    if (!order) throw new Error("Order not found.");
    if (!csrfToken) await fetchCsrfToken();
    const payload = await requestJson(`/api/pharmd/orders/${encodeURIComponent(orderId)}/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({}),
    });
    if (payload?.order) replaceOrderInState(payload.order);
    renderOutputResultsTable();
    return payload;
  }

  async function toggleSkipPharmd(orderId) {
    const order = findOrderById(orderId);
    if (!order) throw new Error("Order not found.");
    if (!hasSavedFinalReport(order)) {
      throw new Error("Saved final report preview is not available for this order yet.");
    }
    const nextSkipState = !isPharmdSkipped(order);
    await updateOrderById(orderId, (row) => {
      const nowIso = new Date().toISOString();
      const pharmd = row?.pharmd && typeof row.pharmd === "object" ? { ...row.pharmd } : {};
      if (nextSkipState) {
        pharmd.skipPharmd = true;
        pharmd.skipPharmdAt = nowIso;
        pharmd.validationReadyAt = nowIso;
      } else {
        delete pharmd.skipPharmd;
        delete pharmd.skipPharmdAt;
        delete pharmd.validationReadyAt;
      }
      return {
        ...row,
        pharmd,
        updatedAt: nowIso,
      };
    });
  }

  function writeLoadingPreviewWindow(previewWindow, title, message) {
    previewWindow.document.open();
    previewWindow.document.write(`
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(title || "Loading Final Report")}</title>
        <style>
          html, body {
            margin: 0;
            min-height: 100%;
            background: #f5f8fc;
            color: #24384f;
            font-family: Arial, sans-serif;
          }
          body {
            display: grid;
            place-items: center;
            padding: 24px;
          }
          .loading-card {
            max-width: 520px;
            border: 1px solid #cfdae6;
            border-radius: 16px;
            background: #fff;
            padding: 22px 24px;
            box-shadow: 0 16px 36px rgba(23, 44, 72, 0.12);
          }
          .loading-card h3 {
            margin: 0 0 8px;
            font-size: 20px;
          }
          .loading-card p {
            margin: 0;
            color: #4a5f77;
            line-height: 1.5;
          }
        </style>
      </head>
      <body>
        <article class="loading-card">
          <h3>${escapeHtml(title || "Loading Final Report")}</h3>
          <p>${escapeHtml(message || "Please wait while we load the saved final report.")}</p>
        </article>
      </body>
      </html>
    `);
    previewWindow.document.close();
  }

  function writePreviewWindowError(previewWindow, title, message) {
    if (!previewWindow) return;
    writeLoadingPreviewWindow(previewWindow, title, message);
  }

  async function openSavedFinalReportPreview(orderId) {
    const order = findOrderById(orderId);
    if (!order) throw new Error("Order not found.");
    if (!hasSavedFinalReport(order)) {
      throw new Error("Saved final report preview is not available for this order yet.");
    }

    const previewWindow = window.open("", "_blank", "popup=yes,width=1080,height=860");
    if (!previewWindow) {
      throw new Error("Unable to open preview window. Please allow pop-ups and try again.");
    }
    writeLoadingPreviewWindow(
      previewWindow,
      `Order #${order?.orderId || "-"} Final Report`,
      `Loading the saved final report preview for Order #${order?.orderId || "-"}.`
    );

    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/final-report-pdf`, {
        credentials: "same-origin",
      });
      if (!response.ok) {
        let errorMessage = "Unable to load the saved final report preview.";
        try {
          const payload = await response.json();
          errorMessage = String(payload?.error || errorMessage);
        } catch {
          const text = await response.text();
          if (text.trim()) errorMessage = text.trim();
        }
        throw new Error(errorMessage);
      }
      const blob = await response.blob();
      if (!blob.size) {
        throw new Error("Saved final report preview is empty.");
      }
      const blobUrl = URL.createObjectURL(blob);
      previewWindow.location.replace(blobUrl);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60 * 1000);
    } catch (error) {
      writePreviewWindowError(
        previewWindow,
        "Final Report Preview Unavailable",
        error?.message || "Unable to load the saved final report preview."
      );
      throw error;
    }
  }

  async function openPharmdReceiptPreview(orderId) {
    const order = findOrderById(orderId);
    if (!order) throw new Error("Order not found.");
    if (!hasPharmdReceivedFile(order)) {
      throw new Error("PharmD return file is not available for this order yet.");
    }

    const previewWindow = window.open("", "_blank", "popup=yes,width=1080,height=860");
    if (!previewWindow) {
      throw new Error("Unable to open preview window. Please allow pop-ups and try again.");
    }
    writeLoadingPreviewWindow(
      previewWindow,
      `Order #${order?.orderId || "-"} PharmD File`,
      `Loading the fetched PharmD file for Order #${order?.orderId || "-"}.`
    );

    try {
      const response = await fetch(`/api/pharmd/orders/${encodeURIComponent(orderId)}/receipt-file`, {
        credentials: "same-origin",
      });
      if (!response.ok) {
        let errorMessage = "Unable to load the PharmD return file.";
        try {
          const payload = await response.json();
          errorMessage = String(payload?.error || errorMessage);
        } catch {
          const text = await response.text();
          if (text.trim()) errorMessage = text.trim();
        }
        throw new Error(errorMessage);
      }
      const blob = await response.blob();
      if (!blob.size) {
        throw new Error("The PharmD return file is empty.");
      }
      const blobUrl = URL.createObjectURL(blob);
      previewWindow.location.replace(blobUrl);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60 * 1000);
    } catch (error) {
      writePreviewWindowError(
        previewWindow,
        "PharmD File Unavailable",
        error?.message || "Unable to load the PharmD return file."
      );
      throw error;
    }
  }

  async function openCombinedPharmdPreview(orderId) {
    const order = findOrderById(orderId);
    if (!order) throw new Error("Order not found.");
    if (!canPreviewCombinedPharmdReport(order)) {
      throw new Error("Both the saved final report and the PharmD file are required for the combined preview.");
    }

    const previewWindow = window.open("", "_blank", "popup=yes,width=1080,height=860");
    if (!previewWindow) {
      throw new Error("Unable to open preview window. Please allow pop-ups and try again.");
    }
    writeLoadingPreviewWindow(
      previewWindow,
      `Order #${order?.orderId || "-"} Combined PDF`,
      `Loading the combined final report and PharmD file for Order #${order?.orderId || "-"}.`
    );

    try {
      const response = await fetch(`/api/pharmd/orders/${encodeURIComponent(orderId)}/combined-report-pdf`, {
        credentials: "same-origin",
      });
      if (!response.ok) {
        let errorMessage = "Unable to load the combined PharmD PDF.";
        try {
          const payload = await response.json();
          errorMessage = String(payload?.error || errorMessage);
        } catch {
          const text = await response.text();
          if (text.trim()) errorMessage = text.trim();
        }
        throw new Error(errorMessage);
      }
      const blob = await response.blob();
      if (!blob.size) {
        throw new Error("The combined PharmD PDF is empty.");
      }
      const blobUrl = URL.createObjectURL(blob);
      previewWindow.location.replace(blobUrl);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60 * 1000);
    } catch (error) {
      writePreviewWindowError(
        previewWindow,
        "Combined PDF Unavailable",
        error?.message || "Unable to load the combined PharmD PDF."
      );
      throw error;
    }
  }

  async function markOrderComplete(orderId) {
    const order = findOrderById(orderId);
    if (!order) throw new Error("Order not found.");
    if (!canValidatePharmdFinalReport(order)) {
      throw new Error("This order is not ready to move to Completed yet.");
    }
    await updateOrderById(orderId, (row) => {
      const nowIso = new Date().toISOString();
      const pharmd = row?.pharmd && typeof row.pharmd === "object" ? { ...row.pharmd } : {};
      pharmd.completedAt = nowIso;
      pharmd.completionSource = isPharmdSkipped(row) ? "skip_pharmd" : "pharmd_report_received";
      return {
        ...row,
        status: "Complete",
        completedAt: nowIso,
        updatedAt: nowIso,
        pharmd,
      };
    });
  }

  async function returnOrderToPendingPharmd(orderId) {
    const order = findOrderById(orderId);
    if (!order) throw new Error("Order not found.");
    if (resolveOutputBucket(order) !== "completed") {
      throw new Error("Only completed reports can be moved back to Pending PharmD.");
    }
    if (order?.publishedReports?.final?.publishedAt) {
      throw new Error("Published reports must stay in Completed.");
    }
    await updateOrderById(orderId, (row) => {
      const nowIso = new Date().toISOString();
      const pharmd = row?.pharmd && typeof row.pharmd === "object" ? { ...row.pharmd } : {};
      delete pharmd.completedAt;
      delete pharmd.completionSource;
      return {
        ...row,
        status: "Pending",
        completedAt: "",
        updatedAt: nowIso,
        pharmd,
      };
    });
  }

  function buildGenericQueueTableMarkup(rows) {
    const showCompletedActions = activeTab === "completed";
    const showRejectedActions = activeTab === "rejected";
    return `
      <div class="output-results-meta">Rows: ${rows.length}</div>
      <table class="order-history-table">
        <thead>
          <tr>
            <th>Order #</th>
            <th>Accession #</th>
            <th>Patient</th>
            <th>Panel</th>
            <th>Provider</th>
            <th>Facility</th>
            <th>Last Activity</th>
            <th>Stage</th>
            ${showCompletedActions ? '<th class="output-results-preview-col">Preview Report</th>' : ""}
            ${showCompletedActions ? '<th class="output-results-publish-col">Actions</th>' : ""}
            ${showRejectedActions ? '<th class="output-results-publish-col">Actions</th>' : ""}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const orderId = String(row?.orderId || "").trim();
              const isPharmdBypassed = isPharmdSkipped(row);
              const canPreviewFinal = hasSavedFinalReport(row);
              const canPreviewCombined = canPreviewCombinedPharmdReport(row);
              const isOpeningFinal = previewLoadingOrders.has(orderId);
              const isOpeningCombined = openingCombinedPharmdOrders.has(orderId);
              const canPreviewReport = isPharmdBypassed ? canPreviewFinal : canPreviewCombined;
              const isOpeningReport = isPharmdBypassed ? isOpeningFinal : isOpeningCombined;
              const isWorkflowSaving = workflowSavingOrders.has(orderId);
              const isPublished = Boolean(row?.publishedReports?.final?.publishedAt);
              return `
                <tr>
                  <td>${escapeHtml(row?.orderId || "-")}</td>
                  <td>${escapeHtml(resolveOrderAccession(row))}</td>
                  <td>
                    <strong>${escapeHtml(row?.patientName || "-")}</strong>
                    <div class="subtle">(${escapeHtml(row?.patientId || "-")})</div>
                  </td>
                  <td>${escapeHtml(row?.services?.[0]?.serviceName || "Lab Panel")}</td>
                  <td>${escapeHtml(row?.provider || "-")}</td>
                  <td>${escapeHtml(row?.facilityName || "-")}</td>
                  <td>${escapeHtml(formatOutputDate(resolveOutputLastActivityAt(row)))}</td>
                  <td><span class="history-status ${resolveOutputBadgeClass(row)}">${escapeHtml(resolveOutputStageLabel(row))}</span></td>
                  ${showCompletedActions ? `
                    <td class="output-results-preview-cell">
                      <button
                        type="button"
                        class="table-action-btn preview-btn"
                        ${isPharmdBypassed ? "data-validate-final-report" : "data-preview-pharmd-combined"}="${escapeHtml(orderId)}"
                        ${canPreviewReport && !isOpeningReport ? "" : "disabled"}
                      >
                        ${isOpeningReport ? "Opening..." : "Preview"}
                      </button>
                      <div class="subtle output-results-inline-note">
                        ${isPharmdBypassed
                          ? (canPreviewFinal ? "Preview the saved final report." : "Requires a saved final report.")
                          : (canPreviewCombined ? "Preview the combined PharmD and final report PDF." : "Requires saved final report and PharmD file.")}
                      </div>
                    </td>
                  ` : ""}
                  ${showCompletedActions ? `
                    <td class="output-results-publish-cell">
                      <div class="output-results-message-actions">
                        <button
                          type="button"
                          class="table-action-btn publish-report-btn"
                          data-open-completed-publish="${escapeHtml(orderId)}"
                          ${isWorkflowSaving ? "disabled" : ""}
                        >
                          Publish
                        </button>
                        <button
                          type="button"
                          class="table-action-btn"
                          data-return-to-pending-pharmd="${escapeHtml(orderId)}"
                          ${!isPublished && !isWorkflowSaving ? "" : "disabled"}
                        >
                          ${isWorkflowSaving ? "Returning..." : "Return to PharmD"}
                        </button>
                      </div>
                      <div class="subtle output-results-inline-note">
                        ${isPublished ? "Published reports stay in Completed." : "Moves this report back to the Pending PharmD queue."}
                      </div>
                    </td>
                  ` : ""}
                  ${showRejectedActions ? `
                    <td class="output-results-publish-cell">
                      <button type="button" class="table-action-btn btn-danger-outline" data-undo-reject-order="${escapeHtml(orderId)}" ${isWorkflowSaving ? "disabled" : ""}>
                        ${isWorkflowSaving ? "Restoring..." : "Undo Reject"}
                      </button>
                      <div class="subtle output-results-inline-note">Returns this order to its status before rejection.</div>
                    </td>
                  ` : ""}
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  function hasPharmdSendStarted(order) {
    const statusToken = String(
      order?.pharmd?.sendStatus
      || order?.pharmd?.deliveryStatus
      || order?.pharmd?.status
      || ""
    ).trim().toLowerCase();
    return Boolean(
      order?.pharmd?.sentAt
      || order?.pharmd?.submittedAt
      || ["sent", "uploaded", "delivered", "transmitted"].includes(statusToken)
    );
  }

  function resolvePharmdWorkflowState(order) {
    const orderId = String(order?.orderId || "").trim();
    const hasMessage = Boolean(resolvePharmdOruMessage(order));
    const accession = resolvePharmdAccession(order);
    const hasSavedFinal = hasSavedFinalReport(order);
    const skipEnabled = isPharmdSkipped(order);
    const reportReceivedAt = resolvePharmdReportReceivedAt(order);
    const hasReceivedFile = hasPharmdReceivedFile(order);
    const canValidate = hasSavedFinal && canValidatePharmdFinalReport(order);
    const canPreviewCombined = canPreviewCombinedPharmdReport(order);
    const state = {
      orderId,
      hasMessage,
      hasSavedFinal,
      hasReceivedFile,
      skipEnabled,
      reportReceivedAt,
      canValidate,
      canPreviewCombined,
      isSending: sendingPharmdOrders.has(orderId),
      isChecking: checkingPharmdOrders.has(orderId),
      isOpeningReceipt: openingPharmdReceiptOrders.has(orderId),
      isOpeningCombined: openingCombinedPharmdOrders.has(orderId),
      isWorkflowSaving: workflowSavingOrders.has(orderId),
      isPreviewLoading: previewLoadingOrders.has(orderId),
      stageClass: "status-pending",
      primaryAction: null,
      secondaryActions: [],
    };

    if (!accession) {
      return {
        ...state,
        label: "Blocked",
        detail: "Missing accession. Add the accession before PharmD tracking can continue.",
        secondaryActions: ["log"],
      };
    }
    if (!hasSavedFinal) {
      return {
        ...state,
        label: "Needs Final Report",
        detail: "Save the final report before PharmD review or validation.",
        secondaryActions: ["view_oru", "download_oru", "log"],
      };
    }
    if (skipEnabled) {
      return {
        ...state,
        label: "PharmD Bypassed",
        detail: "PharmD review was bypassed. The saved final report can be reviewed.",
        stageClass: "status-processed",
        primaryAction: "validate",
        secondaryActions: ["resume_pharmd", "view_oru", "download_oru", "log", "mark_complete"],
      };
    }
    if (reportReceivedAt || hasReceivedFile) {
      return {
        ...state,
        label: "Ready to Validate",
        detail: "PharmD return file has been received.",
        stageClass: "status-complete",
        primaryAction: "validate",
        secondaryActions: ["preview_combined", "view_file", "view_oru", "download_oru", "log", "mark_complete"],
      };
    }
    if (hasPharmdSendStarted(order)) {
      return {
        ...state,
        label: "Waiting for PharmD",
        detail: "Sent to PharmD. Check for the return file when ready.",
        stageClass: "status-processed",
        primaryAction: "check_return",
        secondaryActions: ["view_oru", "download_oru", "log", "bypass_pharmd"],
      };
    }
    if (!hasMessage) {
      return {
        ...state,
        label: "Blocked",
        detail: "HL7 ORU message is unavailable for this order.",
        secondaryActions: ["log"],
      };
    }
    return {
      ...state,
      label: "Ready to Send",
      detail: "Final report is saved and the ORU message is ready for PharmD.",
      stageClass: "status-processed",
      primaryAction: "send",
      secondaryActions: ["view_oru", "download_oru", "log", "bypass_pharmd"],
    };
  }

  function buildPharmdPrimaryActionMarkup(state) {
    const orderId = escapeHtml(state.orderId);
    if (state.primaryAction === "send") {
      return `
        <button type="button" class="table-action-btn output-results-primary-action" data-send-pharmd-message="${orderId}" ${state.hasMessage && !state.isSending && !state.isWorkflowSaving ? "" : "disabled"}>
          ${state.isSending ? "Sending..." : "Send to PharmD"}
        </button>
      `;
    }
    if (state.primaryAction === "check_return") {
      return `
        <button type="button" class="table-action-btn output-results-primary-action" data-check-pharmd-receipt="${orderId}" ${!state.isChecking ? "" : "disabled"}>
          ${state.isChecking ? "Checking..." : "Check Return"}
        </button>
      `;
    }
    if (state.primaryAction === "validate") {
      return `
        <button type="button" class="table-action-btn preview-btn output-results-primary-action" data-validate-final-report="${orderId}" ${state.canValidate && !state.isPreviewLoading ? "" : "disabled"}>
          ${state.isPreviewLoading ? "Opening..." : "Review & Validate"}
        </button>
      `;
    }
    return '<button type="button" class="table-action-btn output-results-primary-action" disabled>No Action</button>';
  }

  function buildPharmdSecondaryActionMarkup(action, row, state) {
    const orderId = escapeHtml(state.orderId);
    if (action === "view_oru") {
      return `<button type="button" class="table-action-btn" data-view-pharmd-message="${orderId}" ${state.hasMessage ? "" : "disabled"}>View ORU</button>`;
    }
    if (action === "download_oru") {
      return `<button type="button" class="table-action-btn" data-download-pharmd-message="${orderId}" data-pharmd-file-name="${escapeHtml(resolvePharmdMessageFileName(row))}" ${state.hasMessage ? "" : "disabled"}>Download ORU</button>`;
    }
    if (action === "view_file") {
      return `<button type="button" class="table-action-btn" data-view-pharmd-receipt="${orderId}" ${state.hasReceivedFile && !state.isOpeningReceipt ? "" : "disabled"}>${state.isOpeningReceipt ? "Opening..." : "View File"}</button>`;
    }
    if (action === "preview_combined") {
      return `<button type="button" class="table-action-btn preview-btn" data-preview-pharmd-combined="${orderId}" ${state.canPreviewCombined && !state.isOpeningCombined ? "" : "disabled"}>${state.isOpeningCombined ? "Opening..." : "Preview Combined"}</button>`;
    }
    if (action === "bypass_pharmd") {
      return `<button type="button" class="table-action-btn" data-toggle-skip-pharmd="${orderId}" ${state.hasSavedFinal && !state.isWorkflowSaving ? "" : "disabled"}>${state.isWorkflowSaving ? "Saving..." : "Bypass PharmD"}</button>`;
    }
    if (action === "resume_pharmd") {
      return `<button type="button" class="table-action-btn" data-toggle-skip-pharmd="${orderId}" ${state.isWorkflowSaving ? "disabled" : ""}>${state.isWorkflowSaving ? "Saving..." : "Resume PharmD"}</button>`;
    }
    if (action === "mark_complete") {
      return `<button type="button" class="table-action-btn" data-mark-complete="${orderId}" ${state.canValidate && !state.isWorkflowSaving ? "" : "disabled"}>${state.isWorkflowSaving ? "Saving..." : "Mark Complete"}</button>`;
    }
    if (action === "log") {
      return `<button type="button" class="table-action-btn" data-view-pharmd-log="${orderId}">Log</button>`;
    }
    return "";
  }

  function buildPendingPharmdTableMarkup(rows) {
    return `
      <div class="output-results-meta">Rows: ${rows.length}</div>
      <table class="order-history-table">
        <thead>
          <tr>
            <th>Order #</th>
            <th>Accession #</th>
            <th>Patient</th>
            <th>Panel</th>
            <th>Workflow</th>
            <th>Next Action</th>
            <th>Supporting Actions</th>
            <th>Queued / Sent</th>
            <th>Report Received</th>
            <th>PharmD File</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const orderId = String(row?.orderId || "").trim();
              const state = resolvePharmdWorkflowState(row);
              const receivedFileName = resolvePharmdReceivedFileName(row);
              return `
                <tr>
                  <td>${escapeHtml(row?.orderId || "-")}</td>
                  <td>${escapeHtml(resolveOrderAccession(row))}</td>
                  <td>
                    <strong>${escapeHtml(row?.patientName || "-")}</strong>
                    <div class="subtle">(${escapeHtml(row?.patientId || "-")})</div>
                  </td>
                  <td>
                    ${escapeHtml(row?.services?.[0]?.serviceName || "Lab Panel")}
                    <div class="subtle">${escapeHtml(row?.provider || "-")} • ${escapeHtml(row?.facilityName || "-")}</div>
                  </td>
                  <td>
                    <span class="history-status ${escapeHtml(state.stageClass)}">${escapeHtml(state.label)}</span>
                    <div class="subtle output-results-inline-note">${escapeHtml(state.detail)}</div>
                  </td>
                  <td>
                    ${buildPharmdPrimaryActionMarkup(state)}
                  </td>
                  <td>
                    <div class="output-results-message-actions output-results-secondary-actions">
                      ${state.secondaryActions.map((action) => buildPharmdSecondaryActionMarkup(action, row, state)).join("")}
                    </div>
                  </td>
                  <td>${escapeHtml(formatOutputDate(resolvePharmdQueuedOrSentAt(row)))}</td>
                  <td>${escapeHtml(formatOutputDate(resolvePharmdReportReceivedAt(row)))}</td>
                  <td>
                    <div class="subtle output-results-inline-note">
                      ${state.hasReceivedFile ? escapeHtml(receivedFileName || "Stored PharmD return file") : "No PharmD file stored yet."}
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  function renderOutputResultsTable() {
    const rows = getFilteredOrders();
    if (!outputTableNode) return;
    refreshOutputTabCounts();

    if (!rows.length) {
      outputTableNode.innerHTML = `
        <section class="output-results-empty">
          <p class="badge">Queue Clear</p>
          <h3>No orders are currently in ${escapeHtml(outputTabs.find((tab) => tab.key === activeTab)?.label || "this queue")}.</h3>
          <p class="subtle">Try another tab or clear the search to review more result records.</p>
        </section>
      `;
      return;
    }

    outputTableNode.innerHTML = activeTab === "pending-pharmd"
      ? buildPendingPharmdTableMarkup(rows)
      : buildGenericQueueTableMarkup(rows);
  }

  panelBody.innerHTML = `
    <section class="output-results-page">
      <div class="output-results-hero">
        <div>
          <p class="badge">Result Workflow</p>
          <h3>Output Results</h3>
          <p class="subtle">Review result queues by operational stage so pending work is easier to triage.</p>
        </div>
        <div class="output-results-controls">
          <label class="output-results-search">
            <span>Search</span>
            <input id="output-results-search" type="search" placeholder="Order, accession, patient, provider">
          </label>
          <label class="output-results-sort">
            <span>Sort</span>
            <select id="output-results-sort">
              <option value="created-desc" ${outputSortMode === "created-desc" ? "selected" : ""}>Created newest first</option>
              <option value="created-asc" ${outputSortMode === "created-asc" ? "selected" : ""}>Created oldest first</option>
              <option value="activity-desc" ${outputSortMode === "activity-desc" ? "selected" : ""}>Last activity newest first</option>
              <option value="activity-asc" ${outputSortMode === "activity-asc" ? "selected" : ""}>Last activity oldest first</option>
            </select>
          </label>
        </div>
      </div>

      <div id="output-results-tabs" class="output-results-tabs" role="tablist" aria-label="Output Results Queues">
        ${outputTabs
          .map((tab) => `
            <button
              type="button"
              class="history-tab ${tab.key === activeTab ? "active" : ""}"
              data-output-tab="${tab.key}"
              role="tab"
              aria-selected="${tab.key === activeTab ? "true" : "false"}"
            >
              <span>${tab.label}</span>
              <strong>${getTabCount(tab.key)}</strong>
            </button>
          `)
          .join("")}
      </div>

      <div id="output-results-table"></div>
      <div id="output-results-publish-modal" class="output-results-publish-modal hidden" aria-hidden="true"></div>
    </section>
  `;

  tabsNode = document.getElementById("output-results-tabs");
  const searchNode = document.getElementById("output-results-search");
  const sortNode = document.getElementById("output-results-sort");
  outputTableNode = document.getElementById("output-results-table");
  publishModalNode = document.getElementById("output-results-publish-modal");

  tabsNode?.addEventListener("click", (event) => {
    const tabBtn = event.target.closest("[data-output-tab]");
    if (!tabBtn) return;
    const nextTab = String(tabBtn.getAttribute("data-output-tab") || "").trim();
    if (!nextTab || nextTab === activeTab) return;
    activeTab = nextTab;
    closeCompletedPublishModal();
    tabsNode.querySelectorAll("[data-output-tab]").forEach((node) => {
      const selected = node.getAttribute("data-output-tab") === activeTab;
      node.classList.toggle("active", selected);
      node.setAttribute("aria-selected", String(selected));
    });
    renderOutputResultsTable();
  });

  searchNode?.addEventListener("input", (event) => {
    searchQuery = event.target.value || "";
    closeCompletedPublishModal();
    renderOutputResultsTable();
  });

  sortNode?.addEventListener("change", (event) => {
    outputSortMode = event.target.value || "created-desc";
    closeCompletedPublishModal();
    renderOutputResultsTable();
  });

  outputTableNode?.addEventListener("click", (event) => {
    const publishBtn = event.target.closest("[data-open-completed-publish]");
    if (publishBtn) {
      const orderId = String(publishBtn.getAttribute("data-open-completed-publish") || "").trim();
      if (!orderId) return;
      openCompletedPublishModal(orderId);
      return;
    }

    const sendBtn = event.target.closest("[data-send-pharmd-message]");
    if (sendBtn) {
      const orderId = String(sendBtn.getAttribute("data-send-pharmd-message") || "").trim();
      if (!orderId || sendingPharmdOrders.has(orderId)) return;
      sendingPharmdOrders.add(orderId);
      renderOutputResultsTable();
      sendPharmdOrder(orderId)
        .then((payload) => {
          alert(payload?.message || "PharmD HL7 file sent successfully.");
        })
        .catch((error) => {
          alert(error?.message || "Unable to send PharmD HL7 file.");
        })
        .finally(() => {
          sendingPharmdOrders.delete(orderId);
          renderOutputResultsTable();
        });
      return;
    }

    const checkBtn = event.target.closest("[data-check-pharmd-receipt]");
    if (checkBtn) {
      const orderId = String(checkBtn.getAttribute("data-check-pharmd-receipt") || "").trim();
      if (!orderId || checkingPharmdOrders.has(orderId)) return;
      checkingPharmdOrders.add(orderId);
      renderOutputResultsTable();
      checkPharmdReceipt(orderId)
        .then((payload) => {
          alert(payload?.message || "Manual PharmD receipt check completed.");
        })
        .catch((error) => {
          alert(error?.message || "Unable to check for the PharmD return file.");
        })
        .finally(() => {
          checkingPharmdOrders.delete(orderId);
          renderOutputResultsTable();
        });
      return;
    }

    const receiptBtn = event.target.closest("[data-view-pharmd-receipt]");
    if (receiptBtn) {
      const orderId = String(receiptBtn.getAttribute("data-view-pharmd-receipt") || "").trim();
      if (!orderId || openingPharmdReceiptOrders.has(orderId)) return;
      openingPharmdReceiptOrders.add(orderId);
      renderOutputResultsTable();
      openPharmdReceiptPreview(orderId)
        .catch((error) => {
          alert(error?.message || "Unable to open the PharmD return file.");
        })
        .finally(() => {
          openingPharmdReceiptOrders.delete(orderId);
          renderOutputResultsTable();
        });
      return;
    }

    const combinedBtn = event.target.closest("[data-preview-pharmd-combined]");
    if (combinedBtn) {
      const orderId = String(combinedBtn.getAttribute("data-preview-pharmd-combined") || "").trim();
      if (!orderId || openingCombinedPharmdOrders.has(orderId)) return;
      openingCombinedPharmdOrders.add(orderId);
      renderOutputResultsTable();
      openCombinedPharmdPreview(orderId)
        .catch((error) => {
          alert(error?.message || "Unable to open the combined PharmD PDF.");
        })
        .finally(() => {
          openingCombinedPharmdOrders.delete(orderId);
          renderOutputResultsTable();
        });
      return;
    }

    const skipBtn = event.target.closest("[data-toggle-skip-pharmd]");
    if (skipBtn) {
      const orderId = String(skipBtn.getAttribute("data-toggle-skip-pharmd") || "").trim();
      if (!orderId || workflowSavingOrders.has(orderId)) return;
      workflowSavingOrders.add(orderId);
      renderOutputResultsTable();
      toggleSkipPharmd(orderId)
        .catch((error) => {
          alert(error?.message || "Unable to update Skip PharmD for this order.");
        })
        .finally(() => {
          workflowSavingOrders.delete(orderId);
          renderOutputResultsTable();
        });
      return;
    }

    const logBtn = event.target.closest("[data-view-pharmd-log]");
    if (logBtn) {
      const orderId = logBtn.getAttribute("data-view-pharmd-log");
      const order = findOrderById(orderId);
      if (!order) {
        alert("Order not found.");
        return;
      }
      openPlainTextPreviewWindow({
        title: `Order ${order?.orderId || ""} PharmD Send Log`,
        heading: `PharmD Send Log • Order #${order?.orderId || "-"}`,
        content: buildPharmdLogPreview(order),
      });
      return;
    }

    const viewBtn = event.target.closest("[data-view-pharmd-message]");
    if (viewBtn) {
      const orderId = viewBtn.getAttribute("data-view-pharmd-message");
      const order = findOrderById(orderId);
      const message = resolvePharmdOruMessage(order);
      if (!message) {
        alert("No HL7 ORU message is available for this order yet.");
        return;
      }
      openPlainTextPreviewWindow({
        title: `Order ${order?.orderId || ""} PharmD ORU`,
        heading: `PharmD ORU Message • Order #${order?.orderId || "-"}`,
        content: message,
      });
      return;
    }

    const downloadBtn = event.target.closest("[data-download-pharmd-message]");
    if (downloadBtn) {
      const orderId = downloadBtn.getAttribute("data-download-pharmd-message");
      const order = findOrderById(orderId);
      const message = resolvePharmdOruMessage(order);
      if (!message) {
        alert("No HL7 ORU message is available for this order yet.");
        return;
      }
      downloadPlainTextFile({
        content: message,
        fileName: downloadBtn.getAttribute("data-pharmd-file-name") || resolvePharmdMessageFileName(order),
        mimeType: "text/plain;charset=utf-8",
      });
      return;
    }

    const validateBtn = event.target.closest("[data-validate-final-report]");
    if (validateBtn) {
      const orderId = String(validateBtn.getAttribute("data-validate-final-report") || "").trim();
      if (!orderId || previewLoadingOrders.has(orderId)) return;
      previewLoadingOrders.add(orderId);
      renderOutputResultsTable();
      openSavedFinalReportPreview(orderId)
        .catch((error) => {
          alert(error?.message || "Unable to open the saved final report preview.");
        })
        .finally(() => {
          previewLoadingOrders.delete(orderId);
          renderOutputResultsTable();
        });
      return;
    }

    const completeBtn = event.target.closest("[data-mark-complete]");
    if (completeBtn) {
      const orderId = String(completeBtn.getAttribute("data-mark-complete") || "").trim();
      if (!orderId || workflowSavingOrders.has(orderId)) return;
      workflowSavingOrders.add(orderId);
      renderOutputResultsTable();
      markOrderComplete(orderId)
        .catch((error) => {
          alert(error?.message || "Unable to mark this report as complete.");
        })
        .finally(() => {
          workflowSavingOrders.delete(orderId);
          renderOutputResultsTable();
        });
      return;
    }

    const undoRejectBtn = event.target.closest("[data-undo-reject-order]");
    if (undoRejectBtn) {
      const orderId = String(undoRejectBtn.getAttribute("data-undo-reject-order") || "").trim();
      if (!orderId || workflowSavingOrders.has(orderId)) return;
      workflowSavingOrders.add(orderId);
      renderOutputResultsTable();
      undoRejectOrderWithConfirmation(orderId)
        .catch((error) => {
          alert(error?.message || "Unable to undo this rejection.");
        })
        .finally(() => {
          workflowSavingOrders.delete(orderId);
          renderOutputResultsTable();
        });
      return;
    }

    const returnBtn = event.target.closest("[data-return-to-pending-pharmd]");
    if (returnBtn) {
      const orderId = String(returnBtn.getAttribute("data-return-to-pending-pharmd") || "").trim();
      if (!orderId || workflowSavingOrders.has(orderId)) return;
      workflowSavingOrders.add(orderId);
      renderOutputResultsTable();
      returnOrderToPendingPharmd(orderId)
        .catch((error) => {
          alert(error?.message || "Unable to move this report back to Pending PharmD.");
        })
        .finally(() => {
          workflowSavingOrders.delete(orderId);
          renderOutputResultsTable();
        });
    }
  });

  publishModalNode?.addEventListener("click", (event) => {
    if (event.target === publishModalNode || event.target.closest("[data-close-output-publish-modal]")) {
      closeCompletedPublishModal();
      return;
    }

    const publishViewBtn = event.target.closest("[data-publish-view]");
    if (publishViewBtn) {
      publishModalView = String(publishViewBtn.getAttribute("data-publish-view") || "menu").trim() || "menu";
      renderCompletedPublishModal();
      return;
    }

    const channelBtn = event.target.closest("[data-publish-channel]");
    if (channelBtn) {
      const channel = String(channelBtn.getAttribute("data-publish-channel") || "").trim();
      const order = publishModalOrderId ? findOrderById(publishModalOrderId) : null;
      if (!order) {
        closeCompletedPublishModal();
        alert("Order not found.");
        return;
      }
      if (channel === "fax") {
        publishModalView = "fax-confirm";
        renderCompletedPublishModal();
        loadCompletedPublishFaxDetails(order?.orderId).catch(() => {});
        return;
      }
      alert(`Email publishing for Order #${order?.orderId || "-"} will be connected next.`);
      return;
    }

    const confirmFaxBtn = event.target.closest("[data-confirm-publish-fax]");
    if (!confirmFaxBtn) return;
    const orderId = String(confirmFaxBtn.getAttribute("data-confirm-publish-fax") || "").trim();
    if (!orderId || publishingFaxOrders.has(orderId)) return;
    publishingFaxOrders.add(orderId);
    renderCompletedPublishModal();
    sendCompletedReportFax(orderId)
      .then((payload) => {
        closeCompletedPublishModal();
        renderOutputResultsTable();
        alert(payload?.message || `Fax queued successfully for ${publishFaxDisplayNumber}.`);
      })
      .catch((error) => {
        alert(error?.message || "Unable to send fax.");
      })
      .finally(() => {
        publishingFaxOrders.delete(orderId);
        renderCompletedPublishModal();
        renderOutputResultsTable();
      });
  });

  renderOutputResultsTable();
  renderCompletedPublishModal();
}

function getOrderHistoryReportMenuApi() {
  if (typeof window === "undefined") return null;
  return window.LabCenterOrderHistoryReportMenu || null;
}

function getOrderHistoryReviewMenuApi() {
  if (typeof window === "undefined") return null;
  return window.LabCenterOrderHistoryReviewMenu || null;
}

function getManualTranscriptionApi() {
  if (typeof window === "undefined") return null;
  return window.LabCenterManualTranscription || null;
}

function getOrderHistoryReportMenuLabel() {
  const label = getOrderHistoryReportMenuApi()?.getOrderHistoryReportMenuLabel?.();
  return String(label || "Generate Report");
}

function createOrderHistoryReportMenuModel(options = {}) {
  const model = getOrderHistoryReportMenuApi()?.createOrderHistoryReportMenuModel?.(options);
  if (model && typeof model === "object" && typeof model.triggerLabel === "string") {
    return model;
  }

  const hasProcessedReport = Boolean(options.hasProcessedReport);
  const isOpen = Boolean(options.isOpen);
  const orderId = String(options.orderId || "").trim();
  if (!hasProcessedReport) {
    return {
      available: false,
      isOpen,
      orderId,
      triggerLabel: "Generate Report",
      triggerState: "unavailable",
      ariaLabel: orderId ? `Generate report options for order #${orderId}` : "Generate report options",
      actions: [],
    };
  }

  const actions = [
    {
      key: "generate-report",
      label: Boolean(options.isGenerating) ? "Generating Report..." : "Generate Report",
      disabled: Boolean(options.isGenerating),
      tone: "generate",
    },
    {
      key: "generate-summary-report",
      label: Boolean(options.isGeneratingSummary) ? "Generating Summary..." : "Summary Report",
      disabled: Boolean(options.isGeneratingSummary),
      tone: "summary",
    },
    {
      key: "generate-final-report",
      label: Boolean(options.isGeneratingFinal) ? "Generating Final..." : "Final Report",
      disabled: Boolean(options.isGeneratingFinal),
      tone: "final",
    },
  ];
  const hasBusyAction = actions.some((action) => action.disabled);

  return {
    available: true,
    isOpen,
    orderId,
    triggerLabel: "Generate Report",
    triggerState: hasBusyAction ? "busy" : isOpen ? "open" : "idle",
    ariaLabel: orderId ? `Generate report options for order #${orderId}` : "Generate report options",
    actions,
  };
}

function getOrderHistoryReviewMenuLabel() {
  const label = getOrderHistoryReviewMenuApi()?.getOrderHistoryReviewMenuLabel?.();
  return String(label || "Review Result");
}

function createOrderHistoryReviewMenuModel(options = {}) {
  const model = getOrderHistoryReviewMenuApi()?.createOrderHistoryReviewMenuModel?.(options);
  if (
    model
    && typeof model === "object"
    && model.primaryAction
    && typeof model.primaryAction.key === "string"
  ) {
    return model;
  }

  const hasProcessedReport = Boolean(options.hasProcessedReport);
  const isOpen = Boolean(options.isOpen);
  const orderId = String(options.orderId || "").trim();
  const actions = [
    {
      key: hasProcessedReport ? "validate" : "transcribe",
      label: hasProcessedReport ? "Validate" : "Transcribe",
      disabled: false,
      isPrimary: true,
      tone: hasProcessedReport ? "validate" : "transcribe",
    },
    {
      key: hasProcessedReport ? "transcribe" : "validate",
      label: hasProcessedReport ? "Transcribe" : "Validate (Requires Report)",
      disabled: !hasProcessedReport,
      isPrimary: false,
      tone: hasProcessedReport ? "transcribe" : "validate",
    },
    {
      key: "reject",
      label: "Reject Order",
      disabled: false,
      isPrimary: false,
      tone: "reject",
    },
  ];
  const primaryAction = actions[0];

  return {
    available: true,
    isOpen,
    orderId,
    triggerLabel: "Review Result",
    triggerState: isOpen ? "open" : "idle",
    ariaLabel: orderId ? `Review result options for order #${orderId}` : "Review result options",
    primaryAction,
    triggerTone: primaryAction.tone,
    actions,
  };
}

function renderOrderHistory(initialTab = "all-orders") {
  const allHistoryTabs = [
    { key: "all-orders", label: "All Orders" },
    { key: "order-settlements", label: "Order Settlements" },
    { key: "add-service", label: "Add Service To Order" },
    { key: "upload-results", label: "Upload Test Results" },
  ];
  const historyTabs = activeSession.type === "client" ? allHistoryTabs.slice(0, 1) : allHistoryTabs;
  const validHistoryTabs = new Set(historyTabs.map((item) => item.key));
  const startingTab = validHistoryTabs.has(initialTab) ? initialTab : "all-orders";

  panelBody.innerHTML = `
    <section class="order-history-page">
      <div class="order-history-banner">
        <div class="order-history-banner-copy">
          <h4>POS and Payment Gateway Integrations</h4>
          <p>Seamless integration with payment tools for order settlement and collection workflows.</p>
        </div>
        <div class="order-history-banner-actions">
          <button type="button" class="btn-ghost">Dismiss</button>
          <button type="button" class="btn-primary">Learn More</button>
        </div>
      </div>

      <div class="order-history-topbar">
        <div class="order-history-tabs">
          ${historyTabs
            .map((item) => `
              <button
                type="button"
                class="history-tab ${item.key === startingTab ? "active" : ""}"
                data-tab="${item.key}"
              >
                ${item.label}
              </button>
            `)
            .join("")}
        </div>
        <div class="order-history-searches">
          <div class="order-id-search">
            <input id="history-order-id" placeholder="Search Order Id">
            <button type="button" id="history-order-search">Search</button>
          </div>
          <div class="date-range-group">
            <label>From <input id="history-from-date" type="date"></label>
            <label>To <input id="history-to-date" type="date"></label>
          </div>
        </div>
      </div>

      <div id="upload-results-panel" class="upload-results-panel hidden"></div>
      <div class="order-history-table-wrap">
        <div id="order-history-table"></div>
      </div>
      <div id="order-preview-modal" class="history-preview-modal hidden"></div>
    </section>
  `;

  const tableNode = document.getElementById("order-history-table");
  const orderIdInput = document.getElementById("history-order-id");
  const fromDateInput = document.getElementById("history-from-date");
  const toDateInput = document.getElementById("history-to-date");
  const searchBtn = document.getElementById("history-order-search");
  const tabsNode = panelBody.querySelector(".order-history-tabs");
  const uploadPanelNode = document.getElementById("upload-results-panel");
  const tableWrapNode = panelBody.querySelector(".order-history-table-wrap");
  const previewModalNode = document.getElementById("order-preview-modal");
  const orderHistoryPageNode = panelBody.querySelector(".order-history-page");
  let activeTab = startingTab;
  let uploadStatusMessage = "";
  let openReportMenuOrderId = "";
  let openReviewMenuOrderId = "";
  const processingOrders = new Set();
  const generatingReports = new Set();
  const generatingSummaryReports = new Set();
  const generatingFinalReports = new Set();
  const publishingFinalReports = new Set();
  const openingResultPreviews = new Set();
  const validationDraftReports = new Map();
  const validationUndoState = new Map();
  const headerMap = {
    orderId: "Ord...",
    accessionNo: "Accession #",
    patientDetails: "Patient Details",
    provider: "Provider",
    orderSource: "Order Source",
    facilityName: "Facility Name",
    orderDate: "Order Date",
    amount: "Order Amo...",
    due: "Due",
    uploadRaw: "Upload Tests Raw",
    status: "Status",
    resultPreview: "Preview Result",
    reviewAction: getOrderHistoryReviewMenuLabel(),
    preview: "Preview",
    reportActions: getOrderHistoryReportMenuLabel(),
    publishReport: "PrePublish",
  };
  const headerClassMap = {
    reviewAction: "review-action-col",
    reportActions: "reports-action-col",
    publishReport: "report-action-col",
  };
  const filters = {
    accessionNo: "",
    patientDetails: "",
    provider: "",
    orderSource: "",
    facilityName: "",
    orderDate: "",
    amount: "",
    due: "",
    status: "",
  };

  function shouldShowRawUploadColumn() {
    return activeTab !== "all-orders";
  }

  function buildReviewActionMarkup(row) {
    const orderId = String(row?.orderId || "").trim();
    const model = createOrderHistoryReviewMenuModel({
      orderId,
      hasProcessedReport: Boolean(row?.processedResult?.report),
      isOpen: orderId && openReviewMenuOrderId === orderId,
    });

    if (!model.available || !model.primaryAction) {
      return `<span class="subtle">-</span>`;
    }

    return `
      <div class="review-menu-shell" data-review-menu-shell>
        <div class="review-menu-split">
          <button
            type="button"
            class="table-action-btn review-menu-primary ${model.primaryAction.tone === "validate" ? "validate-btn" : "transcribe-btn"}"
            data-review-menu-primary="${escapeHtml(orderId)}"
            data-review-menu-default-action="${escapeHtml(model.primaryAction.key)}"
            aria-label="${escapeHtml(model.primaryAction.label)} for order #${escapeHtml(orderId)}"
          >
            ${escapeHtml(model.primaryAction.label)}
          </button>
          <button
            type="button"
            class="table-action-btn review-menu-toggle review-menu-toggle--${escapeHtml(model.triggerTone)} ${model.isOpen ? "is-open" : ""}"
            data-review-menu-trigger="${escapeHtml(orderId)}"
            aria-haspopup="menu"
            aria-expanded="${model.isOpen ? "true" : "false"}"
            aria-label="${escapeHtml(model.ariaLabel)}"
            aria-controls="review-menu-${escapeHtml(orderId)}"
          >
            <span class="report-menu-chevron" aria-hidden="true">▾</span>
          </button>
        </div>
        ${model.isOpen ? `
          <div id="review-menu-${escapeHtml(orderId)}" class="report-menu-dropdown" role="menu">
            ${model.actions.map((action) => `
              <button
                type="button"
                class="report-menu-option report-menu-option--${escapeHtml(action.tone)}"
                data-review-menu-action="${escapeHtml(action.key)}"
                data-order-id="${escapeHtml(orderId)}"
                role="menuitem"
                ${action.disabled ? "disabled" : ""}
              >
                <span class="report-menu-option-main">
                  <span class="report-menu-option-indicator" aria-hidden="true"></span>
                  <span>${escapeHtml(action.label)}</span>
                </span>
              </button>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }

  function buildReportsActionMarkup(row, options = {}) {
    const orderId = String(row?.orderId || "").trim();
    const model = createOrderHistoryReportMenuModel({
      orderId,
      hasProcessedReport: Boolean(row?.processedResult?.report),
      isGenerating: Boolean(options.isGenerating),
      isGeneratingSummary: Boolean(options.isGeneratingSummary),
      isGeneratingFinal: Boolean(options.isGeneratingFinal),
      isOpen: orderId && openReportMenuOrderId === orderId,
    });

    if (!model.available) {
      return `<span class="subtle">-</span>`;
    }

    return `
      <div class="report-menu-shell" data-report-menu-shell>
        <button
          type="button"
          class="table-action-btn report-menu-trigger ${model.triggerState === "open" ? "is-open" : ""} ${model.triggerState === "busy" ? "is-busy" : ""}"
          data-report-menu-trigger="${escapeHtml(orderId)}"
          aria-haspopup="menu"
          aria-expanded="${model.isOpen ? "true" : "false"}"
          aria-label="${escapeHtml(model.ariaLabel)}"
          aria-controls="report-menu-${escapeHtml(orderId)}"
        >
          <span>${escapeHtml(model.triggerLabel)}</span>
          <span class="report-menu-chevron" aria-hidden="true">▾</span>
        </button>
        ${model.isOpen ? `
          <div id="report-menu-${escapeHtml(orderId)}" class="report-menu-dropdown" role="menu">
            ${model.actions.map((action) => `
              <button
                type="button"
                class="report-menu-option report-menu-option--${escapeHtml(action.tone)}"
                data-report-menu-action="${escapeHtml(action.key)}"
                data-order-id="${escapeHtml(orderId)}"
                role="menuitem"
                ${action.disabled ? "disabled" : ""}
              >
                <span class="report-menu-option-main">
                  <span class="report-menu-option-indicator" aria-hidden="true"></span>
                  <span>${escapeHtml(action.label)}</span>
                </span>
              </button>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }

  function closeReportMenu() {
    if (!openReportMenuOrderId) return false;
    openReportMenuOrderId = "";
    return true;
  }

  function closeReviewMenu() {
    if (!openReviewMenuOrderId) return false;
    openReviewMenuOrderId = "";
    return true;
  }

  async function runOrderHistoryReviewAction(orderId, actionKey) {
    const normalizedOrderId = String(orderId || "").trim();
    const normalizedActionKey = String(actionKey || "").trim();
    if (!normalizedOrderId || !normalizedActionKey) return;

    if (normalizedActionKey === "validate") {
      openValidate(normalizedOrderId);
      return;
    }
    if (normalizedActionKey === "transcribe") {
      openTranscribe(normalizedOrderId);
      return;
    }
    if (normalizedActionKey === "reject") {
      try {
        const rejectedOrder = await rejectOrderWithConfirmation(normalizedOrderId);
        if (rejectedOrder) renderTable();
      } catch (error) {
        alert(error?.message || "Unable to reject this order.");
      }
    }
  }

  async function runOrderHistoryReportAction(orderId, actionKey) {
    const numericId = Number(orderId);
    if (!orderId || Number.isNaN(numericId)) return;

    const actionHandlers = {
      "generate-report": {
        busySet: generatingReports,
        run: openGenerateReport,
      },
      "generate-summary-report": {
        busySet: generatingSummaryReports,
        run: openGenerateSummaryReport,
      },
      "generate-final-report": {
        busySet: generatingFinalReports,
        run: openGenerateFinalReport,
      },
    };

    const actionConfig = actionHandlers[actionKey];
    if (!actionConfig || actionConfig.busySet.has(numericId)) return;

    actionConfig.busySet.add(numericId);
    renderTable();
    try {
      await actionConfig.run(orderId);
    } finally {
      actionConfig.busySet.delete(numericId);
      renderTable();
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const payload = String(reader.result || "");
        const encoded = payload.includes(",") ? payload.split(",")[1] : payload;
        resolve(encoded || "");
      };
      reader.onerror = () => reject(new Error("Unable to read file."));
      reader.readAsDataURL(file);
    });
  }

  function getOrderPanelName(order) {
    const firstLine = order?.services?.[0];
    if (firstLine?.serviceName) return firstLine.serviceName;
    return "Lab Panel";
  }

  function getOrderAccession(order) {
    const existing = String(order?.accessionNo || order?.accession || "").trim();
    if (existing) return existing;
    if (!order?.orderId) return "-";
    return buildAccessionNumber({
      serviceLine: order?.services?.[0] || {},
      orderDate: order?.sampleCollectTime || order?.createdAt,
      orderId: order.orderId,
    });
  }

  const reportLogoPath = "/assets/report-template/image1.jpg";
  const reportFinalHeaderLogoPath = "/assets/report-template/image1.jpg";
  const reportFooterWavePath = "/assets/report-template/image2.png";
  const reportTotalPages = 3;
  const summaryReportTotalPages = 1;
  const reportPathogenRowsPage1 = 18;
  const reportPathogenRowsPage2 = 10;
  const reportAbrRowsPage2 = 13;
  const reportAssetDataUriCache = new Map();
  const summaryReportTestedGenes = [
    "ampC",
    "NDM",
    "KPC",
    "OXA-48",
    "VIM",
    "IMP-7",
    "SHV",
    "TEM",
    "CTX-M group 1",
    "CTX-M group 2",
    "mefA",
    "ErmA",
    "ErmB",
    "mecA",
    "femA",
    "QnrB",
    "QnrA",
    "vanA1",
    "vanA2",
    "vanB",
  ];

  const resistanceOverviewCatalog = [
    { abrClass: "AmpC Resistance Marker", gene: "ampC", aliases: ["ampC"] },
    { abrClass: "Carbapenem resistance Marker", gene: "NDM", aliases: ["NDM"] },
    { abrClass: "Carbapenem resistance Marker", gene: "KPC", aliases: ["KPC"] },
    { abrClass: "Carbapenem resistance Marker", gene: "OXA-48", aliases: ["OXA-48", "OXA48"] },
    { abrClass: "Carbapenem resistance Marker", gene: "VIM, IMP-7", aliases: ["VIM, IMP-7", "VIM IMP-7", "VIM IMP7"] },
    { abrClass: "ESBL Resistance Marker", gene: "SHV", aliases: ["SHV"] },
    { abrClass: "ESBL Resistance Marker", gene: "TEM", aliases: ["TEM"] },
    { abrClass: "ESBL Resistance Marker", gene: "CTX-M group 1", aliases: ["CTX-M group 1", "CTXM group 1"] },
    { abrClass: "ESBL Resistance Marker", gene: "CTX-M group 2", aliases: ["CTX-M group 2", "CTXM group 2"] },
    { abrClass: "Macrolide Resistance Marker", gene: "mefA", aliases: ["mefA"] },
    { abrClass: "Macrolide Resistance Marker", gene: "ErmA", aliases: ["ErmA"] },
    { abrClass: "Macrolide Resistance Marker", gene: "ErmB", aliases: ["ErmB"] },
    { abrClass: "Methicillin Resistance Marker", gene: "mecA", aliases: ["mecA"] },
    { abrClass: "Methicillin Resistance Marker", gene: "femA", aliases: ["femA"] },
    { abrClass: "Quinolone and fluoroquinolone resistance", gene: "QnrB", aliases: ["QnrB"] },
    { abrClass: "Quinolone and fluoroquinolone resistance", gene: "QnrA", aliases: ["QnrA"] },
    { abrClass: "Vancomycin resistance Marker", gene: "vanA1, vanA2", aliases: ["vanA1, vanA2", "vanA1 vanA2"] },
    { abrClass: "Vancomycin resistance Marker", gene: "vanB", aliases: ["vanB"] },
  ];

  const resistanceInterpretationCatalog = {
    "VIM, IMP-7": {
      title: "VIM, IMP-7",
      sections: [
        "Expression of VIM, IMP-7 has been associated with resistance to the following antibiotics*",
        "Penicillins - benzylpenicillin, phenoxymethylpenicillin, methicillin, oxacillin, cloxacillin, nafcillin, ampicillin, amoxicillin, carbenicillin, ticarcillin, piperacillin, temocillin, mecillinam.",
        "Cephalosporins - cephalexin, cefaclor, cefazolin, cefprozil, cefuroxime, cefoxitin, cefotetan, cefmetazole, cefotaxime, cefoperazone, ceftriaxone, ceftibuten, ceftazidime, cefpodoxime, cefepime.",
        "Carbapenems - doripenem, meropenem, imipenem.",
      ],
    },
    "CTX-M group 1": {
      title: "CTX-M group 1",
      sections: [
        "Expression of CTXM 1 has been associated with resistance to the following antibiotics.",
        "Cephalosporins - Cefdinir, Keflex, Cefuroxime, Ceftriaxone, Ceftazidime/avibactam, Cefazolin.",
      ],
    },
  };

  const resistanceAliasMap = new Map();
  resistanceOverviewCatalog.forEach((row) => {
    row.aliases.forEach((alias) => {
      resistanceAliasMap.set(
        String(alias || "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, ""),
        row.gene
      );
    });
  });
  const resistanceAliasEntries = [...resistanceAliasMap.entries()];
  const resistanceCatalogGenes = [...new Set(resistanceOverviewCatalog.map((row) => row.gene))];

  function normalizeReportKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function isDetectedResult(value) {
    const normalized = String(value || "").toLowerCase();
    return normalized.includes("detected") && !normalized.includes("not detected");
  }

  function formatDetailedResult(value) {
    if (isDetectedResult(value)) return "DETECTED";
    if (String(value || "").toLowerCase().includes("inconclusive")) return "INCONCLUSIVE";
    return "NOT DETECTED";
  }

  function formatSummaryResult(value, options = {}) {
    const withAsterisk = Boolean(options.withAsterisk);
    if (!isDetectedResult(value)) return "Not Detected";
    const normalized = String(value || "").toLowerCase();
    const suffix = withAsterisk ? "*" : "";
    if (normalized.includes("high")) return `Detected - High${suffix}`;
    if (normalized.includes("moderate")) return `Detected - Moderate${suffix}`;
    if (normalized.includes("low")) return `Detected - Low${suffix}`;
    return `Detected${suffix}`;
  }

  function formatReportDateTime(value) {
    return formatAppDateTime(value, {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }, "-");
  }

  function formatReportDate(value) {
    return formatAppDate(value, {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }, "-");
  }

  function formatReportCtValue(row, options = {}) {
    const ctRaw = String(row?.ctRaw || "").trim();
    const ctRawIsUndetermined = ctRaw.toLowerCase() === "undetermined";
    const decimals = Number.isInteger(options?.decimals) && options.decimals >= 0
      ? options.decimals
      : null;
    const forceFixed = Boolean(options?.forceFixed);

    if (decimals === null) {
      if (ctRaw && !ctRawIsUndetermined) return ctRaw;
      const ct = Number(row?.ctValue);
      if (!Number.isFinite(ct)) return "";
      const fixed = Number(ct.toFixed(2));
      return Number.isInteger(fixed) ? String(fixed) : fixed.toFixed(2);
    }

    let numericCt = null;
    if (ctRaw && !ctRawIsUndetermined) {
      const matched = ctRaw.match(/-?\d+(?:\.\d+)?/);
      if (matched) {
        const parsed = Number(matched[0]);
        if (Number.isFinite(parsed)) numericCt = parsed;
      }
    }
    if (!Number.isFinite(numericCt)) {
      const ct = Number(row?.ctValue);
      if (Number.isFinite(ct)) numericCt = ct;
    }
    if (!Number.isFinite(numericCt)) {
      if (ctRaw && !ctRawIsUndetermined) return ctRaw;
      return "";
    }

    const rounded = numericCt.toFixed(decimals);
    if (forceFixed) return rounded;
    const roundedNumber = Number(rounded);
    return Number.isInteger(roundedNumber) ? String(roundedNumber) : rounded;
  }

  function blobToDataUri(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read report asset."));
      reader.readAsDataURL(blob);
    });
  }

  async function fetchAssetDataUri(assetPath) {
    const cached = reportAssetDataUriCache.get(assetPath);
    if (cached) return cached;
    const response = await fetch(assetPath, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Unable to load report template asset (${assetPath}).`);
    const dataUri = await blobToDataUri(await response.blob());
    reportAssetDataUriCache.set(assetPath, dataUri);
    return dataUri;
  }

  async function getReportTemplateAssetSources() {
    const [logoSrc, finalHeaderLogoSrc, footerSrc] = await Promise.all([
      fetchAssetDataUri(reportLogoPath),
      fetchAssetDataUri(reportFinalHeaderLogoPath),
      fetchAssetDataUri(reportFooterWavePath),
    ]);
    return { logoSrc, finalHeaderLogoSrc, footerSrc };
  }

  function pickReportMetadataValue(metadata, aliases = []) {
    if (!metadata || typeof metadata !== "object") return "";
    const entries = Object.entries(metadata);
    for (const alias of aliases) {
      const target = normalizeReportKey(alias);
      const matched = entries.find(([key]) => normalizeReportKey(key) === target);
      if (matched && String(matched[1] || "").trim()) return String(matched[1]).trim();
    }
    return "";
  }

  function extractResistanceGeneNames(value) {
    const key = normalizeReportKey(value);
    if (!key) return [];
    const matches = new Set();

    const exact = resistanceAliasMap.get(key);
    if (exact) matches.add(exact);

    resistanceAliasEntries.forEach(([aliasKey, gene]) => {
      if (!aliasKey || !gene) return;
      if (key.includes(aliasKey)) matches.add(gene);
    });

    if (key.includes("ctxmgroup1") || key.includes("ctxm1")) matches.add("CTX-M group 1");
    if (key.includes("ctxmgroup2") || key.includes("ctxm2")) matches.add("CTX-M group 2");
    if (key.includes("vim") && (key.includes("imp7") || key.includes("imp"))) matches.add("VIM, IMP-7");
    if (key.includes("vana1") || key.includes("vana2")) matches.add("vanA1, vanA2");
    if (key.includes("oxa48")) matches.add("OXA-48");

    return resistanceCatalogGenes.filter((gene) => matches.has(gene));
  }

  function normalizeResistanceGeneName(value) {
    return extractResistanceGeneNames(value)[0] || "";
  }

  function dedupeReportRows(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const key = normalizeReportKey(row?.pathogen || "");
      if (!key) return;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, row);
        return;
      }
      const existingDetected = isDetectedResult(existing?.result);
      const nextDetected = isDetectedResult(row?.result);
      if (!existingDetected && nextDetected) {
        map.set(key, row);
        return;
      }
      if (existingDetected === nextDetected) {
        const existingCt = Number(existing?.ctValue);
        const nextCt = Number(row?.ctValue);
        if (Number.isFinite(nextCt) && (!Number.isFinite(existingCt) || nextCt < existingCt)) {
          map.set(key, row);
        }
      }
    });
    return [...map.values()];
  }

  function parseReportCtNumericValue(row) {
    const ctRaw = String(row?.ctRaw || "").trim();
    if (ctRaw && ctRaw.toLowerCase() !== "undetermined") {
      const matched = ctRaw.match(/-?\d+(?:\.\d+)?/);
      if (matched) {
        const parsed = Number(matched[0]);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    const ct = Number(row?.ctValue);
    return Number.isFinite(ct) ? ct : null;
  }

  function resolveSarsCov2TargetKey(pathogenName) {
    const key = normalizeReportKey(pathogenName);
    if (!key) return "";
    if (key === "egene" || key.endsWith("egene")) return "e";
    if (key === "ngene" || key.endsWith("ngene")) return "n";
    if (key.includes("orf1ab") || key.includes("orflab")) return "orf1ab";
    return "";
  }

  function collapseSarsCov2PathogenNames(pathogenNames) {
    const names = Array.isArray(pathogenNames) ? pathogenNames : [];
    const collapsed = [];
    const seen = new Set();
    const pushUnique = (value) => {
      const key = normalizeReportKey(value);
      if (!key || seen.has(key)) return;
      seen.add(key);
      collapsed.push(value);
    };

    names.forEach((item) => {
      const name = String(item || "").trim();
      if (!name) return;
      const normalized = normalizeReportKey(name);
      const isGeneTarget = Boolean(resolveSarsCov2TargetKey(name));
      const isSarsLabel = normalized === "sarscov2";
      if (isGeneTarget || isSarsLabel) {
        pushUnique("SARS-CoV-2");
        return;
      }
      pushUnique(name);
    });

    return collapsed;
  }

  function isRespiratoryPathogensPanel(panelName) {
    const key = normalizeReportKey(panelName);
    if (!key) return false;
    return key === "respiratorypathogenspanel" || (key.includes("respiratory") && key.includes("pathogen"));
  }

  function buildFinalSarsCov2RuleResult(rows) {
    const sourceRows = dedupeReportRows(Array.isArray(rows) ? rows : []);
    const markerRows = new Map();

    sourceRows.forEach((row) => {
      const marker = resolveSarsCov2TargetKey(row?.pathogen);
      if (!marker) return;
      const existing = markerRows.get(marker);
      if (!existing) {
        markerRows.set(marker, row);
        return;
      }
      const existingCt = parseReportCtNumericValue(existing);
      const nextCt = parseReportCtNumericValue(row);
      if (Number.isFinite(nextCt) && (!Number.isFinite(existingCt) || nextCt < existingCt)) {
        markerRows.set(marker, row);
      }
    });

    const formula = getSarsCov2FinalReportFormulaConfig();
    const genes = formula.targets.map((target) => {
      const row = markerRows.get(target.key);
      const ctValue = row ? parseReportCtNumericValue(row) : null;
      const ctDisplay = row ? (formatReportCtValue(row) || "-") : "-";
      return {
        ...target,
        ctValue,
        ctDisplay,
        metThreshold: Number.isFinite(ctValue) && ctValue <= formula.thresholdCt,
      };
    });

    const positiveGeneCount = genes.filter((gene) => gene.metThreshold).length;
    return {
      threshold: formula.thresholdCt,
      genes,
      positiveGeneCount,
      minimumPositiveTargets: formula.minimumPositiveTargets,
      status: positiveGeneCount >= formula.minimumPositiveTargets ? "Positive" : "Negative",
    };
  }

  function buildFinalSarsCov2DetectedPathogens(rows, ruleResult) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const nonTargetRows = sourceRows.filter((row) => !resolveSarsCov2TargetKey(row?.pathogen));
    if (!ruleResult || ruleResult.status !== "Positive") return nonTargetRows;

    const geneRows = sourceRows.filter((row) => resolveSarsCov2TargetKey(row?.pathogen));
    const preferredGeneRow = geneRows.reduce((best, row) => {
      if (!best) return row;
      const bestCt = parseReportCtNumericValue(best);
      const nextCt = parseReportCtNumericValue(row);
      if (Number.isFinite(nextCt) && (!Number.isFinite(bestCt) || nextCt < bestCt)) return row;
      return best;
    }, null);

    const detectedValue = geneRows.find((row) => isDetectedResult(row?.result))?.result || "Detected";
    const syntheticRow = preferredGeneRow
      ? { ...preferredGeneRow, pathogen: "SARS-CoV-2", result: detectedValue }
      : { pathogen: "SARS-CoV-2", result: detectedValue };

    return [syntheticRow, ...nonTargetRows];
  }

  function buildFinalSarsCov2ResultsMarkup(ruleResult) {
    if (!ruleResult) return "";
    const statusClass = ruleResult.status === "Positive" ? "positive" : "negative";
    return `
      <div class="summary-report-blue-bar">RESULTS</div>
      <p class="final-sars-result-line">SARS-CoV-2: <span class="final-sars-result-value ${statusClass}">${escapeHtml(ruleResult.status)}</span></p>
    `;
  }

  function buildPatientDisplayName(row) {
    const full = `${row?.firstName || ""} ${row?.middleName || ""} ${row?.lastName || ""}`.replace(/\s+/g, " ").trim();
    if (full) return full;
    return String(row?.patientName || "").trim() || "-";
  }

  function joinAddressParts(parts) {
    const values = parts
      .map((item) => String(item || "").trim())
      .filter((item) => item && item !== "-" && item.toLowerCase() !== "undefined");
    return values.length ? values.join(", ") : "-";
  }

  function resolvePatientRecord(order) {
    const records = readRegistrations()
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    const patientId = String(order?.patientId || "").trim();
    if (patientId) {
      const matchedById = records.find((row) => String(row?.patientId || "").trim() === patientId);
      if (matchedById) return matchedById;
    }

    const orderName = normalizeReportKey(order?.patientName || "");
    if (orderName) {
      const matchedByName = records.find((row) => normalizeReportKey(buildPatientDisplayName(row)) === orderName);
      if (matchedByName) return matchedByName;
    }

    return null;
  }

  function resolveProviderRecord(providerName, providerNpi = "") {
    const providers = Array.isArray(facilityData?.providers) ? facilityData.providers : [];
    const providerNeedle = normalizeReportKey(providerName);
    const npiNeedle = String(providerNpi || "").trim();

    if (providerNeedle) {
      const matchedByName = providers.find((row) => {
        const candidates = [
          row?.validator_name,
          row?.provider_name,
          row?.display_name,
          row?.provider_information?.providerName,
          row?.provider_information?.displayName,
        ];
        return candidates.some((item) => normalizeReportKey(item) === providerNeedle);
      });
      if (matchedByName) return matchedByName;
    }

    if (npiNeedle) {
      const matchedByNpi = providers.find((row) => {
        const npi = String(row?.npi || row?.provider_information?.npi || "").trim();
        return npi && npi === npiNeedle;
      });
      if (matchedByNpi) return matchedByNpi;
    }

    return null;
  }

  function resolveFacilityRecord(facilityName) {
    const accounts = Array.isArray(facilityData?.accounts) ? facilityData.accounts : [];
    const needle = normalizeReportKey(facilityName);
    if (!needle) return null;
    return (
      accounts.find((row) => {
        const candidates = [row?.name, row?.facility_name, row?.basic_information?.accountName];
        return candidates.some((item) => normalizeReportKey(item) === needle);
      }) || null
    );
  }

  function buildReportContext(order, options = {}) {
    const report = order?.processedResult?.report;
    const metadata = report?.metadata && typeof report.metadata === "object" ? report.metadata : {};
    const patientRecord = resolvePatientRecord(order) || {};
    const providerName = String(order?.provider || patientRecord?.provider || "").trim();
    const providerRecord = resolveProviderRecord(providerName, order?.providerNpi || patientRecord?.providerNpi || "") || {};
    const facilityName = String(order?.facilityName || patientRecord?.facilityName || "").trim();
    const facilityRecord = resolveFacilityRecord(facilityName) || {};

    const patientDob = String(patientRecord?.dob || order?.patientDob || "").trim();
    const patientAgeRaw = String(patientRecord?.age || "").trim();
    const patientAge = patientAgeRaw || (patientDob ? `${calcAge(patientDob) || "-"} years` : "-");
    const patientGender = String(patientRecord?.sex || "").trim();
    const patientId = String(order?.patientId || patientRecord?.patientId || "-").trim() || "-";
    const specimenType = pickReportMetadataValue(metadata, ["Specimen Type"])
      || pickReportMetadataValue(metadata, ["Sample Type"])
      || "Swab";
    const orderDateTime = order?.createdAt || order?.orderBookingTime || order?.sampleCollectTime || "";
    const dateCollected = order?.sampleCollectTime || orderDateTime;
    const dateReceived = order?.orderBookingTime || order?.sampleCollectTime || orderDateTime;
    const reportDate = order?.processedAt || new Date().toISOString();

    const providerPhone = String(
      providerRecord?.contact_no
      || providerRecord?.provider_information?.contactNo
      || providerRecord?.provider_information?.portalContact
      || facilityRecord?.contact
      || "-"
    ).trim() || "-";
    const providerNpi = String(
      order?.providerNpi
      || providerRecord?.npi
      || providerRecord?.provider_information?.npi
      || "-"
    ).trim() || "-";
    const facilityAddress = joinAddressParts([
      facilityRecord?.mailing_address,
      facilityRecord?.city,
      facilityRecord?.state,
      facilityRecord?.zipcode,
    ]);

    const excludeRnaseP = options?.excludeRnaseP === true;
    const detailedRowsSource = Array.isArray(report?.detailed) ? report.detailed : [];
    const detailedRowsRaw = excludeRnaseP ? filterFinalReportRows(detailedRowsSource) : detailedRowsSource;
    const detailedRows = dedupeReportRows(detailedRowsRaw);
    const detailedRowsWithGenes = detailedRows.map((row) => ({
      row,
      resistanceGenes: extractResistanceGeneNames(row?.pathogen),
    }));
    const pathogenRows = detailedRowsWithGenes
      .filter(({ resistanceGenes }) => !resistanceGenes.length)
      .map(({ row }) => row);
    const geneRows = detailedRowsWithGenes
      .filter(({ resistanceGenes }) => resistanceGenes.length)
      .map(({ row }) => row);
    const detectedPathogens = pathogenRows.filter((row) => isDetectedResult(row?.result));
    const detectedGenes = geneRows.filter((row) => isDetectedResult(row?.result));

    const page1Pathogens = pathogenRows.slice(0, reportPathogenRowsPage1);
    while (page1Pathogens.length < reportPathogenRowsPage1) {
      page1Pathogens.push(null);
    }
    const page2Pathogens = pathogenRows.slice(reportPathogenRowsPage1, reportPathogenRowsPage1 + reportPathogenRowsPage2);
    while (page2Pathogens.length < reportPathogenRowsPage2) {
      page2Pathogens.push(null);
    }

    const geneResultMap = new Map();
    geneRows.forEach((row) => {
      const canonicalGenes = extractResistanceGeneNames(row?.pathogen);
      if (!canonicalGenes.length) return;
      canonicalGenes.forEach((canonicalGene) => {
        const existing = geneResultMap.get(canonicalGene);
        if (!existing) {
          geneResultMap.set(canonicalGene, row);
          return;
        }
        const existingDetected = isDetectedResult(existing?.result);
        const nextDetected = isDetectedResult(row?.result);
        if (!existingDetected && nextDetected) {
          geneResultMap.set(canonicalGene, row);
          return;
        }
        if (existingDetected === nextDetected) {
          const existingCt = Number(existing?.ctValue);
          const nextCt = Number(row?.ctValue);
          if (Number.isFinite(nextCt) && (!Number.isFinite(existingCt) || nextCt < existingCt)) {
            geneResultMap.set(canonicalGene, row);
          }
        }
      });
    });

    const abrRows = resistanceOverviewCatalog.map((row) => {
      const geneRow = geneResultMap.get(row.gene);
      return {
        abrClass: row.abrClass,
        gene: row.gene,
        result: formatDetailedResult(geneRow?.result),
        ctValue: isDetectedResult(geneRow?.result) ? formatReportCtValue(geneRow) : "",
      };
    });

    const abrPage2Rows = abrRows.slice(0, reportAbrRowsPage2);
    const abrPage3Rows = abrRows.slice(reportAbrRowsPage2);
    const testedPathogenNames = [...new Set(pathogenRows.map((row) => String(row?.pathogen || "").trim()).filter(Boolean))];
    const testedGeneNames = [
      ...new Set(
        geneRows
          .flatMap((row) => {
            const names = extractResistanceGeneNames(row?.pathogen);
            if (names.length) return names;
            const fallback = String(row?.pathogen || "").trim();
            return fallback ? [fallback] : [];
          })
          .filter(Boolean)
      ),
    ];
    const interpretationRows = [...new Set(detectedGenes.flatMap((row) => extractResistanceGeneNames(row?.pathogen)).filter(Boolean))]
      .map((gene) => {
        const copy = resistanceInterpretationCatalog[gene];
        if (copy) return copy;
        return {
          title: gene,
          sections: [
            `Expression of ${gene} has been associated with resistance to one or more antibiotic classes.`,
          ],
        };
      });

    return {
      order,
      report,
      panelName: String(report?.panelName || getOrderPanelName(order) || "Lab Panel").trim() || "Lab Panel",
      patientInfo: [
        { label: "Patient Name", value: buildPatientDisplayName({ ...patientRecord, patientName: order?.patientName }) },
        { label: "DOB", value: formatReportDate(patientDob) },
        { label: "Age", value: patientAge },
        { label: "Gender", value: patientGender || "-" },
        { label: "Patient ID", value: patientId },
        { label: "Race", value: String(patientRecord?.race || "-").trim() || "-" },
        { label: "Ethnicity", value: String(patientRecord?.ethnicity || "-").trim() || "-" },
      ],
      specimenInfo: [
        { label: "Accession No.", value: getOrderAccession(order) },
        { label: "Order Date & Time", value: formatReportDateTime(orderDateTime) },
        { label: "Date Collected", value: formatReportDateTime(dateCollected) },
        { label: "Date Received", value: formatReportDateTime(dateReceived) },
        { label: "Specimen Type", value: specimenType },
        { label: "Report Date", value: formatReportDateTime(reportDate) },
      ],
      facilityInfo: [
        { label: "Facility Name", value: facilityName || "-" },
        { label: "Ordering Provider", value: providerName || "-" },
        { label: "NPI ID", value: providerNpi },
        { label: "Phone No", value: providerPhone },
        { label: "Address", value: facilityAddress },
      ],
      detectedPathogens,
      detectedGenes,
      testedPathogenNames,
      testedGeneNames,
      page1Pathogens,
      page2Pathogens,
      abrPage2Rows,
      abrPage3Rows,
      interpretationRows,
    };
  }

  function buildReportInfoColumnRows(rows) {
    return rows
      .map((item) => `<tr><th>${escapeHtml(item.label)}:</th><td>${escapeHtml(item.value || "-")}</td></tr>`)
      .join("");
  }

  function buildReportInfoGrid(context) {
    return `
      <table class="final-report-info-grid">
        <thead>
          <tr>
            <th>Patient Information</th>
            <th>Specimen Information</th>
            <th>Facility Information</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><table>${buildReportInfoColumnRows(context.patientInfo)}</table></td>
            <td><table>${buildReportInfoColumnRows(context.specimenInfo)}</table></td>
            <td><table>${buildReportInfoColumnRows(context.facilityInfo)}</table></td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function buildSummaryRowsMarkup(rows, options = {}) {
    const withAsterisk = Boolean(options.withAsterisk);
    const fallbackLabel = options.fallbackLabel || "No pathogens detected.";
    const limit = Number.isFinite(options.limit) ? options.limit : 4;
    const ctDecimals = Number.isInteger(options.ctDecimals) && options.ctDecimals >= 0 ? options.ctDecimals : null;
    const ctForceFixed = Boolean(options.ctForceFixed);
    if (!rows.length) {
      return `<tr><td class="summary-pathogen">${escapeHtml(fallbackLabel)}</td><td class="summary-result">Not Detected</td><td class="summary-ct">-</td></tr>`;
    }
    return rows
      .slice(0, Math.max(1, limit))
      .map((row) => {
        const detectedClass = isDetectedResult(row?.result) ? "detected" : "";
        return `
          <tr>
            <td class="summary-pathogen ${detectedClass}">${escapeHtml(row?.pathogen || "-")}</td>
            <td class="summary-result ${detectedClass}">${escapeHtml(formatSummaryResult(row?.result, { withAsterisk }))}</td>
            <td class="summary-ct ${detectedClass}">${escapeHtml(formatReportCtValue(row, { decimals: ctDecimals, forceFixed: ctForceFixed }) || "-")}</td>
          </tr>
        `;
      })
      .join("");
  }

  function buildSummaryTestedListMarkup(items, emptyLabel, options = {}) {
    const extraClass = String(options?.extraClass || "").trim();
    const classSuffix = extraClass ? ` ${escapeHtml(extraClass)}` : "";
    const values = Array.isArray(items) ? items.map((item) => String(item || "").trim()).filter(Boolean) : [];
    if (!values.length) return `<p class="summary-tested-list empty${classSuffix}">${escapeHtml(emptyLabel)}</p>`;
    return `<p class="summary-tested-list${classSuffix}">${escapeHtml(values.join(", "))}</p>`;
  }

  function buildPathogenTableRows(rows) {
    return rows
      .map((row) => {
        if (!row) return `<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`;
        const detectedClass = isDetectedResult(row?.result) ? "detected" : "";
        return `
          <tr>
            <td class="${detectedClass}">${escapeHtml(row?.pathogen || "-")}</td>
            <td class="${detectedClass}">${escapeHtml(formatDetailedResult(row?.result))}</td>
            <td class="${detectedClass}">${escapeHtml(formatReportCtValue(row) || "")}</td>
          </tr>
        `;
      })
      .join("");
  }

  function buildAbrTableRows(rows) {
    return rows
      .map((row) => {
        const detectedClass = row.result === "DETECTED" ? "detected" : "";
        return `
          <tr>
            <td>${escapeHtml(row.abrClass)}</td>
            <td class="${detectedClass}">${escapeHtml(row.gene)}</td>
            <td class="${detectedClass}">${escapeHtml(row.result)}</td>
            <td class="${detectedClass}">${escapeHtml(row.ctValue || "")}</td>
          </tr>
        `;
      })
      .join("");
  }

  function buildPageHeaderMarkup(context, assetSources, options = {}) {
    const variant = String(options?.variant || "default").trim().toLowerCase();
    if (variant === "final-summary") {
      return `
        <header class="final-report-header final-summary-header">
          <img class="final-report-logo final-summary-logo" src="${escapeHtml(assetSources.finalHeaderLogoSrc || assetSources.logoSrc)}" alt="InnovexLab Logo">
          <div class="final-summary-brand">
            <h1>InnovexLab</h1>
            <p>Driving the Next Generation of Diagnostics</p>
          </div>
          <div class="final-report-lab-meta final-summary-meta">
            <p>1135 NW 23rd Ave, Ste L</p>
            <p>Gainesville, FL 32609</p>
            <p>Phone number: (352) 328-3066</p>
            <p>Lab Director: Dr. Maulik Shah, MD, PhD</p>
            <p>CLIA #: 10D2306552</p>
          </div>
        </header>
        ${buildReportInfoGrid(context)}
      `;
    }
    return `
      <header class="final-report-header">
        <img class="final-report-logo" src="${escapeHtml(assetSources.logoSrc)}" alt="InnovexLab Logo">
        <div class="final-report-lab-meta">
          <h1>InnovexLab</h1>
          <p>1135 NW 23rd Ave, Ste L</p>
          <p>Gainesville, FL 32609</p>
          <p>Phone number: (352) 328-3066</p>
          <p>Lab Director: Dr. Maulik Shah, MD, PhD</p>
          <p>CLIA #: 10D2306552</p>
        </div>
      </header>
      ${buildReportInfoGrid(context)}
    `;
  }

  function buildPageFooterMarkup(pageNumber, assetSources, totalPages = reportTotalPages) {
    return `
      <footer class="final-report-footer">
        <img src="${escapeHtml(assetSources.footerSrc)}" alt="">
        <span>Page ${pageNumber} of ${totalPages}</span>
      </footer>
    `;
  }

  function buildInterpretationMarkup(rows) {
    if (!rows.length) return "";
    return rows
      .map((item) => {
        const body = item.sections
          .map((line) => `<p>${escapeHtml(line)}</p>`)
          .join("");
        return `
          <section class="interpretation-block">
            <h4>${escapeHtml(item.title)}</h4>
            ${body}
          </section>
        `;
      })
      .join("");
  }

  function buildFinalReportHtml(order, assetSources) {
    const context = buildReportContext(order, { excludeRnaseP: true });
    return `
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Final Report #${escapeHtml(order.orderId || "-")}</title>
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          * {
            box-sizing: border-box;
          }
          html,
          body {
            margin: 0;
            padding: 0;
            font-family: "Times New Roman", Times, serif;
            color: #000;
            background: #fff;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .final-report-page {
            width: 210mm;
            height: 297mm;
            padding: 16mm 12mm 28mm;
            position: relative;
            page-break-after: always;
            break-after: page;
            overflow: hidden;
          }
          .final-report-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .final-report-page-last {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .final-report-content {
            height: 100%;
            overflow: hidden;
          }
          .final-report-header {
            display: grid;
            grid-template-columns: 34mm 1fr;
            align-items: start;
            column-gap: 10mm;
            margin-bottom: 4mm;
          }
          .final-report-logo {
            width: 100%;
            max-width: 34mm;
            height: auto;
            max-height: 32mm;
            object-fit: contain;
            object-position: left top;
            align-self: start;
          }
          .final-report-lab-meta {
            justify-self: end;
            text-align: right;
            color: #1880ca;
            line-height: 1.05;
            font-family: Georgia, "Times New Roman", serif;
          }
          .final-report-lab-meta h1 {
            margin: 0 0 2px;
            font-size: 30px;
            color: #103b80;
          }
          .final-report-lab-meta p {
            margin: 0;
            font-size: 13px;
            font-weight: 700;
          }
          .final-report-info-grid {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #8d8d8d;
            font-family: Arial, sans-serif;
          }
          .final-report-info-grid th,
          .final-report-info-grid td {
            border: 1px solid #8d8d8d;
            vertical-align: top;
          }
          .final-report-info-grid > thead th {
            background: #bfefff;
            text-align: center;
            font-size: 12px;
            padding: 2px 4px;
            font-weight: 700;
          }
          .final-report-info-grid > tbody td {
            padding: 0;
            width: 33.333%;
          }
          .final-report-info-grid td table {
            width: 100%;
            border-collapse: collapse;
            table-layout: auto;
          }
          .final-report-info-grid td table th,
          .final-report-info-grid td table td {
            border: 0;
            border-bottom: 1px solid #d7d7d7;
            padding: 2px 2px;
            font-size: 11px;
            text-align: left;
          }
          .final-report-info-grid td table tr:last-child th,
          .final-report-info-grid td table tr:last-child td {
            border-bottom: 0;
          }
          .final-report-info-grid td table th {
            width: 1%;
            font-weight: 700;
            white-space: nowrap;
            padding-right: 2px;
          }
          .final-report-info-grid td table td {
            padding-left: 0;
          }
          .final-report-panel-title {
            margin: 2px 0 0;
            text-align: center;
            color: #173d84;
            font-size: 30px;
            font-family: Georgia, "Times New Roman", serif;
          }
          .final-report-section-title {
            margin: 6px 0 2px;
            color: #147332;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 26px;
            line-height: 1;
          }
          .final-report-blue-bar {
            margin-top: 4px;
            background: #042c79;
            color: #fff;
            font-family: Arial, sans-serif;
            font-weight: 700;
            text-align: center;
            font-size: 12px;
            padding: 3px 4px;
          }
          .final-summary-wrap {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr auto;
            align-items: start;
            gap: 8px;
            margin-top: 4px;
          }
          .final-summary-table {
            grid-column: 1 / 4;
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          .final-summary-table td {
            border-bottom: 1px solid #e4e4e4;
            padding: 3px 4px;
            font-family: Georgia, "Times New Roman", serif;
          }
          .final-summary-table td:nth-child(1),
          .final-summary-table td:nth-child(2),
          .final-summary-table td:nth-child(3) {
            color: #222;
            font-weight: 700;
          }
          .final-summary-table td.summary-pathogen,
          .final-summary-table td.summary-result,
          .final-summary-table td.summary-ct,
          .final-detailed-table td.detected,
          .final-abr-table td.detected {
            color: #d11212;
            font-weight: 700;
          }
          .final-summary-table td.summary-pathogen {
            font-style: italic;
          }
          .final-ct-legend {
            border: 1px solid #6cd0aa;
            background: #f3fffb;
            color: #333;
            font-size: 8px;
            line-height: 1.2;
            padding: 4px 6px;
            width: 170px;
            font-family: Arial, sans-serif;
          }
          .final-detailed-table,
          .final-abr-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 2px;
            font-size: 11px;
          }
          .final-detailed-table th,
          .final-detailed-table td,
          .final-abr-table th,
          .final-abr-table td {
            border: 1px solid #8d8d8d;
            padding: 2px 4px;
          }
          .final-detailed-table th,
          .final-abr-table th {
            background: #042c79;
            color: #fff;
            text-align: left;
            font-family: Arial, sans-serif;
            font-weight: 700;
          }
          .final-detailed-table td:first-child {
            font-style: italic;
          }
          .final-detailed-table td:last-child,
          .final-detailed-table th:last-child,
          .final-abr-table td:last-child,
          .final-abr-table th:last-child {
            width: 84px;
            text-align: center;
          }
          .final-abr-table td:nth-child(2),
          .final-abr-table td:nth-child(3) {
            font-weight: 700;
          }
          .final-body-copy {
            margin-top: 6px;
            font-size: 10px;
            line-height: 1.25;
            font-family: Arial, sans-serif;
          }
          .final-body-copy h4 {
            margin: 5px 0 2px;
            font-size: 11px;
          }
          .final-body-copy p {
            margin: 0 0 4px;
          }
          .overview-title {
            margin: 6px 0 2px;
            text-align: center;
            color: #178232;
            font-size: 31px;
            font-family: Georgia, "Times New Roman", serif;
          }
          .overview-copy {
            margin: 0 0 4px;
            font-size: 10px;
            line-height: 1.2;
            font-family: Arial, sans-serif;
          }
          .interpretation-block {
            margin-top: 5px;
            font-size: 10px;
            line-height: 1.22;
            font-family: Arial, sans-serif;
          }
          .interpretation-block h4 {
            margin: 0 0 1px;
            color: #c21313;
            font-size: 15px;
            font-family: Georgia, "Times New Roman", serif;
            font-style: italic;
          }
          .interpretation-block p {
            margin: 0 0 3px;
          }
          .end-of-report {
            margin-top: 6px;
            text-align: center;
            font-weight: 700;
            font-size: 11px;
            font-family: Arial, sans-serif;
          }
          .final-report-footer {
            position: absolute;
            left: 12mm;
            right: 12mm;
            bottom: 6mm;
            padding-top: 0;
          }
          .final-report-footer img {
            width: 100%;
            height: 14mm;
            object-fit: cover;
            display: block;
          }
          .final-report-footer span {
            position: absolute;
            right: 6px;
            bottom: 0;
            font-size: 11px;
            color: #13366f;
            font-family: Georgia, "Times New Roman", serif;
            font-weight: 700;
          }
          .tight-spacer {
            height: 2px;
          }
        </style>
      </head>
      <body>
        <section class="final-report-page">
          <div class="final-report-content">
            ${buildPageHeaderMarkup(context, assetSources)}
            <h2 class="final-report-panel-title">${escapeHtml(context.panelName)}</h2>
            <h3 class="final-report-section-title">Summary Lab Report</h3>
            <div class="final-report-blue-bar">PATHOGENS DETECTED</div>
            <div class="final-summary-wrap">
              <table class="final-summary-table">
                <tbody>
                  ${buildSummaryRowsMarkup(context.detectedPathogens, { withAsterisk: true, fallbackLabel: "No pathogen detected" })}
                </tbody>
              </table>
              <aside class="final-ct-legend">
                *Microbial Load Classification (Ct Value):<br>
                0 - 25: High Pathogen Load; <br>
                26 - 30: Moderate Pathogen Load; <br>
                31 - 33: Low Pathogen Load; <br>
                >33: Negative
              </aside>
            </div>
            <div class="final-report-blue-bar">RESISTANCE GENES DETECTED</div>
            <table class="final-summary-table">
              <tbody>
                ${buildSummaryRowsMarkup(context.detectedGenes, { withAsterisk: false, fallbackLabel: "No resistance gene detected" })}
              </tbody>
            </table>
            <h3 class="final-report-section-title">Detailed Lab Report</h3>
            <table class="final-detailed-table">
              <thead>
                <tr>
                  <th>Pathogens</th>
                  <th>Result</th>
                  <th>Ct Value</th>
                </tr>
              </thead>
              <tbody>
                ${buildPathogenTableRows(context.page1Pathogens)}
              </tbody>
            </table>
          </div>
          ${buildPageFooterMarkup(1, assetSources)}
        </section>

        <section class="final-report-page">
          <div class="final-report-content">
            ${buildPageHeaderMarkup(context, assetSources)}
            <table class="final-detailed-table">
              <tbody>
                ${buildPathogenTableRows(context.page2Pathogens)}
              </tbody>
            </table>
            <div class="final-body-copy">
              <h4>Methodology</h4>
              <p>DNA/RNA extractions followed by Reverse Transcriptase Polymerase Chain Reaction (RT-PCR) and TaqMan qPCR assays are employed to detect clinically significant pathogens, offering analytical sensitivity and specificity greater than 99%.</p>
              <h4>Limitations</h4>
              <p>This assay may detect pathogens beyond those listed. Detection of pathogens with unknown clinical significance by the assay is considered experimental. Rare false-positive and false-negative results may occur.</p>
              <h4>Disclaimer</h4>
              <p>This test was developed, and its performance characteristics were determined by InnovexLab. It has not been cleared or approved by the FDA. The laboratory is regulated under CLIA as qualified to perform high-complexity testing. This test is intended for clinical use and should not be considered investigational or for research purposes. Please note that the "% of Total Pathogen Load" may exclude certain minute pathogen values that are deemed not medically significant.</p>
            </div>
            <h3 class="overview-title">Antibiotic Resistance Overview</h3>
            <p class="overview-copy">The emergence of antibiotic resistance has led to the discovery of specific genetic mutations within a pathogen that allow it to resist the effects of antibiotics. InnovexLab identifies commonly associated resistant genes to guide providers in selecting the most effective and appropriate therapy to eradicate identified pathogens.</p>
            <table class="final-abr-table">
              <thead>
                <tr>
                  <th>ABR Class</th>
                  <th>Genes</th>
                  <th>Result</th>
                  <th>Ct Value</th>
                </tr>
              </thead>
              <tbody>
                ${buildAbrTableRows(context.abrPage2Rows)}
              </tbody>
            </table>
          </div>
          ${buildPageFooterMarkup(2, assetSources)}
        </section>

        <section class="final-report-page final-report-page-last">
          <div class="final-report-content">
            ${buildPageHeaderMarkup(context, assetSources)}
            <table class="final-abr-table">
              <tbody>
                ${buildAbrTableRows(context.abrPage3Rows)}
              </tbody>
            </table>
            ${buildInterpretationMarkup(context.interpretationRows)}
            <div class="final-body-copy">
              <p>*Detection of a gene associated with resistance to a class of antibiotics may not include all medications within that class and is not intended to represent a complete response profile.</p>
              <h4>Treatment Guidelines Reference:</h4>
              <p>Johns Hopkins ABX Guide, The Johns Hopkins University, 2021. Johns Hopkins Guide, https://www.hopkinsguides.com/hopkins/index/Johns_Hopkins_ABX_Guide/All_Topics/A</p>
              <h4>Advantages</h4>
              <p>Molecular pathology offers a more rapid and precise identification of antimicrobial resistance compared to conventional susceptibility methods. Unlike traditional approaches, which require culturing clinical specimens, molecular pathology can detect antimicrobial resistance directly from the specimen.</p>
              <h4>Disadvantages or limitations</h4>
              <p>A microorganism may exhibit resistance to an antimicrobial agent in different ways that are not reported by our technology. It is possible to get false positives and false negatives on rare occasions.</p>
              <h4>Disclaimer</h4>
              <p>This test was developed, and its performance characteristics were established by InnovexLab. It has not been cleared or approved by the FDA. The laboratory operates under CLIA and COLA regulations, certifying its qualification to perform high-complexity testing. The responsibility for determining the appropriate treatment plan for each patient rests with the ordering physician.</p>
            </div>
            <p class="end-of-report">**END OF REPORT**</p>
          </div>
          ${buildPageFooterMarkup(3, assetSources)}
        </section>
      </body>
      </html>
    `;
  }

  function buildDetectedSummaryReportHtml(order, assetSources, options = {}) {
    const variant = String(options?.variant || "summary").trim().toLowerCase() === "final" ? "final" : "summary";
    const context = buildReportContext(order, { excludeRnaseP: variant === "final" });
    const reportTitle = variant === "final" ? "Final Report" : "Summary Report";
    const reportSectionTitle = variant === "final" ? "Final Lab Report" : "Summary Lab Report";
    const headerVariant = variant === "final" ? "final-summary" : "default";
    const applyRespiratorySarsRule = variant === "final"
      && isRespiratoryPathogensPanel(context.panelName)
      && isSarsCov2FinalReportFormulaEnabled();
    const finalRuleResult = applyRespiratorySarsRule ? buildFinalSarsCov2RuleResult(context.report?.detailed) : null;
    const detectedPathogens = applyRespiratorySarsRule
      ? buildFinalSarsCov2DetectedPathogens(context.detectedPathogens, finalRuleResult)
      : context.detectedPathogens;
    const testedPathogenNames = applyRespiratorySarsRule
      ? collapseSarsCov2PathogenNames(context.testedPathogenNames)
      : context.testedPathogenNames;
    if (!detectedPathogens.length) {
      return `
        <!doctype html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${reportTitle} #${escapeHtml(order.orderId || "-")}</title>
          <style>
            @page {
              size: A4;
              margin: 0;
            }
            * {
              box-sizing: border-box;
            }
            html,
            body {
              margin: 0;
              padding: 0;
              font-family: "Times New Roman", Times, serif;
              color: #000;
              background: #fff;
            }
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .summary-report-page {
              width: 210mm;
              min-height: 297mm;
              padding: 14mm 12mm 28mm;
              position: relative;
              overflow: hidden;
            }
            .summary-report-panel-title {
              margin: 3px 0 6px;
              text-align: center;
              color: #173d84;
              font-size: 24px;
              font-weight: 600;
              font-family: Georgia, "Times New Roman", serif;
            }
            .summary-report-section-title {
              margin: 6px 0 3px;
              color: #147332;
              font-family: Georgia, "Times New Roman", serif;
              font-size: 25px;
              font-weight: 600;
            }
            .summary-report-blue-bar {
              margin-top: 5px;
              background: #042c79;
              color: #fff;
              border: 1px solid #09111e;
              font-family: Arial, sans-serif;
              font-weight: 700;
              text-align: center;
              font-size: 12px;
              padding: 4px 6px;
              letter-spacing: 0.02em;
            }
            .summary-not-detected-wrap {
              display: grid;
              grid-template-columns: minmax(0, 1fr) 172px;
              gap: 8px;
              align-items: start;
              margin-top: 4px;
            }
            .summary-not-detected-card {
              border-bottom: 1px solid #dddddd;
              padding: 8px 4px 10px;
              font-family: Georgia, "Times New Roman", serif;
              font-size: 13px;
              font-weight: 700;
              color: #1f1f1f;
            }
            .summary-not-detected-card .emphasis {
              color: #be1f24;
            }
            .summary-report-legend {
              border: 1px solid #6cd0aa;
              background: #f3fffb;
              color: #215868;
              font-size: 8px;
              line-height: 1.28;
              padding: 5px 6px;
              font-family: Arial, sans-serif;
              text-align: center;
            }
            .summary-tested-list {
              margin: 0;
              border: 1px solid #cfd7e0;
              border-top: 0;
              padding: 6px 8px;
              color: #193246;
              font-size: 8.9px;
              line-height: 1.34;
              font-family: Verdana, Arial, sans-serif;
              min-height: 38px;
            }
            .summary-tested-list.empty {
              color: #5b6d7f;
            }
            .summary-tested-list.final-pathogen-list {
              font-weight: 700;
              font-style: italic;
            }
            .final-sars-result-line {
              margin: 0;
              border: 1px solid #cfd7e0;
              border-top: 0;
              padding: 6px 8px;
              color: #193246;
              font-size: 12px;
              line-height: 1.3;
              font-family: Verdana, Arial, sans-serif;
              font-weight: 700;
            }
            .final-sars-result-value.positive {
              color: #be1f24;
            }
            .final-sars-result-value.negative {
              color: #1f4f78;
            }
            .summary-report-copy {
              margin-top: 8px;
              font-family: Arial, sans-serif;
              font-size: 8.2px;
              line-height: 1.28;
            }
            .summary-report-copy h4 {
              margin: 0 0 2px;
              font-size: 9px;
            }
            .summary-report-copy p {
              margin: 0 0 5px;
              text-align: justify;
            }
            .summary-end-of-report {
              margin: 6px 0 0;
              text-align: center;
              font-family: Arial, sans-serif;
              font-weight: 700;
              font-size: 9px;
            }
            .final-report-header {
              display: grid;
              grid-template-columns: 34mm 1fr;
              align-items: start;
              column-gap: 10mm;
              margin-bottom: 4mm;
            }
            .final-report-logo {
              width: 100%;
              max-width: 34mm;
              height: auto;
              max-height: 32mm;
              object-fit: contain;
              object-position: left top;
              align-self: start;
            }
            .final-report-lab-meta {
              justify-self: end;
              text-align: right;
              color: #1880ca;
              line-height: 1.05;
              font-family: Georgia, "Times New Roman", serif;
            }
            .final-report-lab-meta h1 {
              margin: 0 0 2px;
              font-size: 30px;
              color: #103b80;
            }
            .final-report-lab-meta p {
              margin: 0;
              font-size: 13px;
              font-weight: 700;
            }
            .final-report-header.final-summary-header {
              grid-template-columns: 56mm minmax(0, 1fr) 86mm;
              grid-template-areas:
                "brand brand brand"
                "logo . meta";
              align-items: start;
              column-gap: 6mm;
              row-gap: 5mm;
              margin-bottom: 4mm;
            }
            .final-summary-logo {
              grid-area: logo;
              width: 27mm;
              height: 27mm;
              max-width: 27mm;
              max-height: 27mm;
              object-fit: cover;
              object-position: center 28%;
              justify-self: start;
              align-self: start;
            }
            .final-summary-brand {
              grid-area: brand;
              justify-self: center;
              text-align: center;
              color: #002877;
              font-family: Georgia, "Times New Roman", serif;
            }
            .final-summary-brand h1 {
              margin: 0;
              font-size: 40px;
              font-weight: 700;
              line-height: 1;
            }
            .final-summary-brand p {
              margin: 6px 0 0;
              font-size: 12px;
              font-style: italic;
              color: #2d3a4f;
              font-family: Arial, sans-serif;
              white-space: nowrap;
            }
            .final-summary-meta {
              grid-area: meta;
              justify-self: end;
              align-self: center;
              text-align: right;
              color: #156ebe;
              font-style: italic;
            }
            .final-summary-meta p {
              font-size: 15px;
              line-height: 1.02;
              font-weight: 700;
            }
            .final-report-info-grid {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #8d8d8d;
              font-family: Arial, sans-serif;
            }
            .final-report-info-grid th,
            .final-report-info-grid td {
              border: 1px solid #8d8d8d;
              vertical-align: top;
            }
            .final-report-info-grid > thead th {
              background: #bfefff;
              text-align: center;
              font-size: 12px;
              padding: 2px 4px;
              font-weight: 700;
            }
            .final-report-info-grid > tbody td {
              padding: 0;
              width: 33.333%;
            }
            .final-report-info-grid td table {
              width: 100%;
              border-collapse: collapse;
              table-layout: auto;
            }
            .final-report-info-grid td table th,
            .final-report-info-grid td table td {
              border: 0;
              border-bottom: 1px solid #d7d7d7;
              padding: 2px 2px;
              font-size: 11px;
              text-align: left;
            }
            .final-report-info-grid td table tr:last-child th,
            .final-report-info-grid td table tr:last-child td {
              border-bottom: 0;
            }
            .final-report-info-grid td table th {
              width: 1%;
              font-weight: 700;
              white-space: nowrap;
              padding-right: 2px;
            }
            .final-report-info-grid td table td {
              padding-left: 0;
            }
            .final-report-footer {
              position: absolute;
              left: 12mm;
              right: 12mm;
              bottom: 6mm;
            }
            .final-report-footer img {
              width: 100%;
              height: 14mm;
              object-fit: cover;
              display: block;
            }
            .final-report-footer span {
              position: absolute;
              right: 6px;
              bottom: 0;
              font-size: 11px;
              color: #13366f;
              font-family: Georgia, "Times New Roman", serif;
              font-weight: 700;
            }
          </style>
        </head>
        <body>
          <section class="summary-report-page">
            ${buildPageHeaderMarkup(context, assetSources, { variant: headerVariant })}
            <h2 class="summary-report-panel-title">${escapeHtml(context.panelName)}</h2>
            <h3 class="summary-report-section-title">${reportSectionTitle}</h3>
            <div class="summary-report-blue-bar">PATHOGENS DETECTED</div>
            <div class="summary-not-detected-wrap">
              <div class="summary-not-detected-card">
                Test Result: Pathogen(s) = <span class="emphasis">NOT DETECTED</span>
              </div>
            <aside class="summary-report-legend">
              *Microbial Load Classification (Ct Value)<br>
              10 - 25: High Pathogen Load<br>
              26 - 30: Moderate Pathogen Load<br>
              31 - 33: Low Pathogen Load<br>
              &gt;33: Negative
            </aside>
          </div>
          <div class="summary-report-blue-bar">LIST OF PATHOGENS TESTED</div>
          ${buildSummaryTestedListMarkup(testedPathogenNames, "No pathogen rows available.", {
            extraClass: variant === "final" ? "final-pathogen-list" : "",
            })}
            <div class="summary-report-copy">
              <h4>Methodology</h4>
              <p>DNA/RNA extractions followed by Reverse Transcriptase Polymerase Chain Reaction (RT-PCR) and TaqMan qPCR assays are employed to detect clinically significant pathogens, offering analytical sensitivity and specificity greater than 99%.</p>
              <h4>Limitations</h4>
              <p>This assay may detect pathogens beyond those listed. Detection of pathogens with unknown clinical significance by the assay is considered experimental. Rare false-positive and false-negative results may occur.</p>
              <h4>Disclaimer</h4>
              <p>This test was developed, and its performance characteristics were determined by InnovexLab. It has not been cleared or approved by the FDA. The laboratory is regulated under CLIA as qualified to perform high-complexity testing. This test is intended for clinical use and should not be considered investigational or for research purposes. Please note that the "% of Total Pathogen Load" may exclude certain minute pathogen values that are deemed not medically significant.</p>
            </div>
            <p class="summary-end-of-report">**END OF REPORT**</p>
            ${buildPageFooterMarkup(1, assetSources, summaryReportTotalPages)}
          </section>
        </body>
        </html>
      `;
    }
    return `
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${reportTitle} #${escapeHtml(order.orderId || "-")}</title>
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          * {
            box-sizing: border-box;
          }
          html,
          body {
            margin: 0;
            padding: 0;
            font-family: "Times New Roman", Times, serif;
            color: #000;
            background: #fff;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .summary-report-page {
            width: 210mm;
            min-height: 297mm;
            padding: 14mm 12mm 28mm;
            position: relative;
            overflow: hidden;
          }
          .summary-report-panel-title {
            margin: 3px 0 6px;
            text-align: center;
            color: #173d84;
            font-size: 24px;
            font-weight: 600;
            font-family: Georgia, "Times New Roman", serif;
          }
          .summary-report-blue-bar {
            margin-top: 5px;
            background: #042c79;
            color: #fff;
            border: 1px solid #09111e;
            font-family: Arial, sans-serif;
            font-weight: 700;
            text-align: center;
            font-size: 12px;
            padding: 4px 6px;
            letter-spacing: 0.02em;
          }
          .summary-report-grid {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 172px;
            gap: 8px;
            align-items: start;
            margin-top: 4px;
          }
          .summary-report-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          .summary-report-table td {
            border-bottom: 1px solid #dddddd;
            padding: 4px 4px;
            font-family: Georgia, "Times New Roman", serif;
            color: #1f1f1f;
            font-weight: 700;
          }
          .summary-report-table td.summary-pathogen {
            font-style: italic;
          }
          .summary-report-table td.detected {
            color: #be1f24;
          }
          .summary-report-table td:last-child {
            text-align: right;
            width: 90px;
          }
          .summary-report-legend {
            border: 1px solid #6cd0aa;
            background: #f3fffb;
            color: #215868;
            font-size: 8px;
            line-height: 1.28;
            padding: 5px 6px;
            font-family: Arial, sans-serif;
            text-align: center;
          }
          .summary-tested-list {
            margin: 0;
            border: 1px solid #cfd7e0;
            border-top: 0;
            padding: 6px 8px;
            color: #193246;
            font-size: 8.9px;
            line-height: 1.34;
            font-family: Verdana, Arial, sans-serif;
            min-height: 38px;
          }
          .summary-tested-list.empty {
            color: #5b6d7f;
          }
          .summary-tested-list.final-pathogen-list {
            font-weight: 700;
            font-style: italic;
          }
          .final-sars-result-line {
            margin: 0;
            border: 1px solid #cfd7e0;
            border-top: 0;
            padding: 6px 8px;
            color: #193246;
            font-size: 12px;
            line-height: 1.3;
            font-family: Verdana, Arial, sans-serif;
            font-weight: 700;
          }
          .final-sars-result-value.positive {
            color: #be1f24;
          }
          .final-sars-result-value.negative {
            color: #1f4f78;
          }
          .summary-report-copy {
            margin-top: 8px;
            font-family: Arial, sans-serif;
            font-size: 8.2px;
            line-height: 1.28;
          }
          .summary-report-copy h4 {
            margin: 0 0 2px;
            font-size: 9px;
          }
          .summary-report-copy p {
            margin: 0 0 5px;
            text-align: justify;
          }
          .summary-end-of-report {
            margin: 6px 0 0;
            text-align: center;
            font-family: Arial, sans-serif;
            font-weight: 700;
            font-size: 9px;
          }
          .final-report-header {
            display: grid;
            grid-template-columns: 34mm 1fr;
            align-items: start;
            column-gap: 10mm;
            margin-bottom: 4mm;
          }
          .final-report-logo {
            width: 100%;
            max-width: 34mm;
            height: auto;
            max-height: 32mm;
            object-fit: contain;
            object-position: left top;
            align-self: start;
          }
          .final-report-lab-meta {
            justify-self: end;
            text-align: right;
            color: #1880ca;
            line-height: 1.05;
            font-family: Georgia, "Times New Roman", serif;
          }
          .final-report-lab-meta h1 {
            margin: 0 0 2px;
            font-size: 30px;
            color: #103b80;
          }
          .final-report-lab-meta p {
            margin: 0;
            font-size: 13px;
            font-weight: 700;
          }
          .final-report-header.final-summary-header {
            grid-template-columns: 56mm minmax(0, 1fr) 86mm;
            grid-template-areas:
              "brand brand brand"
              "logo . meta";
            align-items: start;
            column-gap: 6mm;
            row-gap: 5mm;
            margin-bottom: 4mm;
          }
          .final-summary-logo {
            grid-area: logo;
            width: 27mm;
            height: 27mm;
            max-width: 27mm;
            max-height: 27mm;
            object-fit: cover;
            object-position: center 28%;
            justify-self: start;
            align-self: start;
          }
          .final-summary-brand {
            grid-area: brand;
            justify-self: center;
            text-align: center;
            color: #002877;
            font-family: Georgia, "Times New Roman", serif;
          }
          .final-summary-brand h1 {
            margin: 0;
            font-size: 40px;
            font-weight: 700;
            line-height: 1;
          }
          .final-summary-brand p {
            margin: 6px 0 0;
            font-size: 12px;
            font-style: italic;
            color: #2d3a4f;
            font-family: Arial, sans-serif;
            white-space: nowrap;
          }
          .final-summary-meta {
            grid-area: meta;
            justify-self: end;
            align-self: center;
            text-align: right;
            color: #156ebe;
            font-style: italic;
          }
          .final-summary-meta p {
            font-size: 15px;
            line-height: 1.02;
            font-weight: 700;
          }
          .final-report-info-grid {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #8d8d8d;
            font-family: Arial, sans-serif;
          }
          .final-report-info-grid th,
          .final-report-info-grid td {
            border: 1px solid #8d8d8d;
            vertical-align: top;
          }
          .final-report-info-grid > thead th {
            background: #bfefff;
            text-align: center;
            font-size: 12px;
            padding: 2px 4px;
            font-weight: 700;
          }
          .final-report-info-grid > tbody td {
            padding: 0;
            width: 33.333%;
          }
          .final-report-info-grid td table {
            width: 100%;
            border-collapse: collapse;
            table-layout: auto;
          }
          .final-report-info-grid td table th,
          .final-report-info-grid td table td {
            border: 0;
            border-bottom: 1px solid #d7d7d7;
            padding: 2px 2px;
            font-size: 11px;
            text-align: left;
          }
          .final-report-info-grid td table tr:last-child th,
          .final-report-info-grid td table tr:last-child td {
            border-bottom: 0;
          }
          .final-report-info-grid td table th {
            width: 1%;
            font-weight: 700;
            white-space: nowrap;
            padding-right: 2px;
          }
          .final-report-info-grid td table td {
            padding-left: 0;
          }
          .final-report-footer {
            position: absolute;
            left: 12mm;
            right: 12mm;
            bottom: 6mm;
          }
          .final-report-footer img {
            width: 100%;
            height: 14mm;
            object-fit: cover;
            display: block;
          }
          .final-report-footer span {
            position: absolute;
            right: 6px;
            bottom: 0;
            font-size: 11px;
            color: #13366f;
            font-family: Georgia, "Times New Roman", serif;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        <section class="summary-report-page">
          ${buildPageHeaderMarkup(context, assetSources, { variant: headerVariant })}
          <h2 class="summary-report-panel-title">${escapeHtml(context.panelName)}</h2>
          <div class="summary-report-blue-bar">PATHOGENS DETECTED</div>
          <div class="summary-report-grid">
            <table class="summary-report-table">
              <tbody>
                ${buildSummaryRowsMarkup(detectedPathogens, {
                  withAsterisk: true,
                  fallbackLabel: "No pathogen detected",
                  limit: 6,
                  ctDecimals: variant === "final" ? 1 : null,
                  ctForceFixed: variant === "final",
                })}
              </tbody>
            </table>
            <aside class="summary-report-legend">
              *Microbial Load Classification (Ct Value)<br>
              10 - 25: High Pathogen Load<br>
              26 - 30: Moderate Pathogen Load<br>
              31 - 33: Low Pathogen Load<br>
              &gt;33: Negative
            </aside>
          </div>
          <div class="summary-report-blue-bar">RESISTANCE GENES DETECTED</div>
          <table class="summary-report-table">
            <tbody>
              ${buildSummaryRowsMarkup(context.detectedGenes, {
                withAsterisk: false,
                fallbackLabel: "No resistance gene detected",
                limit: 6,
                ctDecimals: variant === "final" ? 1 : null,
                ctForceFixed: variant === "final",
              })}
            </tbody>
          </table>
          <div class="summary-report-blue-bar">LIST OF PATHOGENS TESTED</div>
          ${buildSummaryTestedListMarkup(testedPathogenNames, "No pathogen rows available.", {
            extraClass: variant === "final" ? "final-pathogen-list" : "",
          })}
          <div class="summary-report-blue-bar">LIST OF ANTIBIOTIC RESISTANT GENES TESTED</div>
          ${buildSummaryTestedListMarkup(summaryReportTestedGenes, "No resistance gene rows available.")}
          <div class="summary-report-copy">
            <h4>Methodology</h4>
            <p>DNA/RNA extractions followed by Reverse Transcriptase Polymerase Chain Reaction (RT-PCR) and TaqMan qPCR assays are employed to detect clinically significant pathogens, offering analytical sensitivity and specificity greater than 99%.</p>
            <h4>Limitations</h4>
            <p>This assay may detect pathogens beyond those listed. Detection of pathogens with unknown clinical significance by the assay is considered experimental. Rare false-positive and false-negative results may occur.</p>
            <h4>Disclaimer</h4>
            <p>This test was developed, and its performance characteristics were determined by InnovexLab. It has not been cleared or approved by the FDA. The laboratory is regulated under CLIA as qualified to perform high-complexity testing. This test is intended for clinical use and should not be considered investigational or for research purposes. Please note that the "% of Total Pathogen Load" may exclude certain minute pathogen values that are deemed not medically significant.</p>
          </div>
          <p class="summary-end-of-report">**END OF REPORT**</p>
          ${buildPageFooterMarkup(1, assetSources, summaryReportTotalPages)}
        </section>
      </body>
      </html>
    `;
  }

  function writeReportWindowError(reportWindow, { title, heading, message }) {
    reportWindow.document.open();
    reportWindow.document.write(`
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(title || "Report Generation Failed")}</title>
        <style>
          html, body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #faf7f7;
            color: #5a1f1f;
          }
          .error-card {
            max-width: 720px;
            margin: 42px auto;
            border: 1px solid #ebc4c4;
            border-radius: 12px;
            background: #fff;
            padding: 20px;
          }
          h3 { margin: 0 0 8px; }
          p { margin: 0; line-height: 1.45; }
        </style>
      </head>
      <body>
        <article class="error-card">
          <h3>${escapeHtml(heading || "Unable to generate report")}</h3>
          <p>${escapeHtml(message || "Unexpected error while generating the report.")}</p>
        </article>
      </body>
      </html>
    `);
    reportWindow.document.close();
  }

  async function renderReportPdf(reportWindow, options) {
    const html = String(options?.html || "");
    const fileName = String(options?.fileName || "").trim() || `Report_${Date.now()}.pdf`;
    const orderId = String(options?.orderId || "").trim();
    const reportType = String(options?.reportType || "final").trim() || "final";
    const previewUrl = String(options?.previewUrl || "").trim();
    const isMicrosoftEdge = /\bEdg\//.test(navigator.userAgent);
    if (!csrfToken) await fetchCsrfToken();

    const response = await fetch("/api/orders/render-report-pdf", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        html,
        fileName,
        orderId,
        reportType,
        responseMode: isMicrosoftEdge && previewUrl ? "saved-url" : "pdf",
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      let payload = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }
      throw new Error(payload?.error || raw || "Unable to generate report PDF.");
    }

    if (isMicrosoftEdge && previewUrl) {
      await response.json();
      const separator = previewUrl.includes("?") ? "&" : "?";
      reportWindow.location.replace(`${previewUrl}${separator}v=${Date.now()}`);
      return;
    }
    const pdfBlob = await response.blob();
    const pdfUrl = URL.createObjectURL(pdfBlob);
    reportWindow.location.href = pdfUrl;
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 120000);
  }

  async function openGenerateReport(orderId) {
    if (!facilityDataLoaded) {
      try {
        await loadFacilityData();
      } catch {
        // Report generation can still continue using order + registration details.
      }
    }
    const order = readOrders().find((item) => Number(item.orderId) === Number(orderId));
    if (!order) {
      alert("Order not found.");
      return;
    }
    if (!order?.processedResult?.report) {
      alert("No processed report found for this order.");
      return;
    }

    const reportWindow = window.open("", "_blank", "popup=yes,width=1080,height=860");
    if (!reportWindow) {
      alert("Unable to open report window. Please allow pop-ups and try again.");
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(`
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Generating Final Report...</title>
        <style>
          html, body {
            margin: 0;
            font-family: Arial, sans-serif;
            height: 100%;
            color: #24384f;
            background: #f5f8fc;
          }
          body {
            display: grid;
            place-items: center;
          }
          .loading-card {
            border: 1px solid #cfdae6;
            border-radius: 12px;
            background: #fff;
            padding: 18px 22px;
            box-shadow: 0 8px 20px rgba(23, 44, 72, 0.1);
          }
          .loading-card h3 {
            margin: 0 0 8px;
            font-size: 18px;
          }
          .loading-card p {
            margin: 0;
            font-size: 14px;
            color: #4a5f77;
          }
        </style>
      </head>
      <body>
        <article class="loading-card">
          <h3>Generating final report PDF...</h3>
          <p>Please wait while we prepare the report for Order #${escapeHtml(order.orderId)}.</p>
        </article>
      </body>
      </html>
    `);
    reportWindow.document.close();

    try {
      const assetSources = await getReportTemplateAssetSources();
      const html = buildFinalReportHtml(order, assetSources);
      await renderReportPdf(reportWindow, {
        html,
        orderId: order.orderId,
        fileName: `Order_${order.orderId}_Final_Report.pdf`,
        reportType: "report",
        previewUrl: `/api/orders/${encodeURIComponent(order.orderId)}/generated-report-pdf/report`,
      });
    } catch (error) {
      writeReportWindowError(reportWindow, {
        title: "Report Generation Failed",
        heading: "Unable to generate final report PDF",
        message: error?.message || "Unexpected error while generating report PDF.",
      });
    }
  }

  async function openGenerateFinalReport(orderId) {
    if (!facilityDataLoaded) {
      try {
        await loadFacilityData();
      } catch {
        // Report generation can still continue using order + registration details.
      }
    }
    const order = readOrders().find((item) => Number(item.orderId) === Number(orderId));
    if (!order) {
      alert("Order not found.");
      return;
    }
    if (!order?.processedResult?.report) {
      alert("No processed report found for this order.");
      return;
    }

    const reportWindow = window.open("", "_blank", "popup=yes,width=1080,height=860");
    if (!reportWindow) {
      alert("Unable to open report window. Please allow pop-ups and try again.");
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(`
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Generating Final Report...</title>
        <style>
          html, body {
            margin: 0;
            font-family: Arial, sans-serif;
            height: 100%;
            color: #24384f;
            background: #f5f8fc;
          }
          body {
            display: grid;
            place-items: center;
          }
          .loading-card {
            border: 1px solid #cfdae6;
            border-radius: 12px;
            background: #fff;
            padding: 18px 22px;
            box-shadow: 0 8px 20px rgba(23, 44, 72, 0.1);
          }
          .loading-card h3 {
            margin: 0 0 8px;
            font-size: 18px;
          }
          .loading-card p {
            margin: 0;
            font-size: 14px;
            color: #4a5f77;
          }
        </style>
      </head>
      <body>
        <article class="loading-card">
          <h3>Generating final report PDF...</h3>
          <p>Please wait while we prepare the final report for Order #${escapeHtml(order.orderId)}.</p>
        </article>
      </body>
      </html>
    `);
    reportWindow.document.close();

    try {
      const assetSources = await getReportTemplateAssetSources();
      const html = buildDetectedSummaryReportHtml(order, assetSources, { variant: "final" });
      await renderReportPdf(reportWindow, {
        html,
        orderId: order.orderId,
        fileName: `Order_${order.orderId}_Final_Report.pdf`,
        reportType: "final",
        previewUrl: `/api/orders/${encodeURIComponent(order.orderId)}/final-report-pdf`,
      });
    } catch (error) {
      writeReportWindowError(reportWindow, {
        title: "Final Report Generation Failed",
        heading: "Unable to generate final report PDF",
        message: error?.message || "Unexpected error while generating final report PDF.",
      });
    }
  }

  async function prepublishFinalReport(orderId) {
    if (!facilityDataLoaded) {
      try {
        await loadFacilityData();
      } catch {
        // PrePublish can still validate against whatever order data is available.
      }
    }
    const order = readOrders().find((item) => Number(item.orderId) === Number(orderId));
    if (!order) {
      throw new Error("Order not found.");
    }
    if (!order?.processedResult?.report) {
      throw new Error("No processed report found for this order.");
    }

    const assetSources = await getReportTemplateAssetSources();
    const html = buildDetectedSummaryReportHtml(order, assetSources, { variant: "final" });
    if (!csrfToken) await fetchCsrfToken();

    const response = await requestJson("/api/orders/publish-final-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        orderId: String(orderId),
        html,
        fileName: `Order_${orderId}_Final_Report.pdf`,
      }),
    });

    if (response?.order) {
      const orders = readOrders();
      const index = orders.findIndex((row) => Number(row.orderId) === Number(orderId));
      if (index >= 0) {
        orders[index] = response.order;
        writeOrders(orders);
      }
    }
    alert(response?.message || "PrePublish completed.");
    return response;
  }

  async function openGenerateSummaryReport(orderId) {
    if (!facilityDataLoaded) {
      try {
        await loadFacilityData();
      } catch {
        // Report generation can still continue using order + registration details.
      }
    }
    const order = readOrders().find((item) => Number(item.orderId) === Number(orderId));
    if (!order) {
      alert("Order not found.");
      return;
    }
    if (!order?.processedResult?.report) {
      alert("No processed report found for this order.");
      return;
    }

    const reportWindow = window.open("", "_blank", "popup=yes,width=1080,height=860");
    if (!reportWindow) {
      alert("Unable to open report window. Please allow pop-ups and try again.");
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(`
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Generating Summary Report...</title>
        <style>
          html, body {
            margin: 0;
            font-family: Arial, sans-serif;
            height: 100%;
            color: #24384f;
            background: #f5f8fc;
          }
          body {
            display: grid;
            place-items: center;
          }
          .loading-card {
            border: 1px solid #cfdae6;
            border-radius: 12px;
            background: #fff;
            padding: 18px 22px;
            box-shadow: 0 8px 20px rgba(23, 44, 72, 0.1);
          }
          .loading-card h3 {
            margin: 0 0 8px;
            font-size: 18px;
          }
          .loading-card p {
            margin: 0;
            font-size: 14px;
            color: #4a5f77;
          }
        </style>
      </head>
      <body>
        <article class="loading-card">
          <h3>Generating summary report PDF...</h3>
          <p>Please wait while we prepare the summary report for Order #${escapeHtml(order.orderId)}.</p>
        </article>
      </body>
      </html>
    `);
    reportWindow.document.close();

    try {
      const assetSources = await getReportTemplateAssetSources();
      const html = buildDetectedSummaryReportHtml(order, assetSources);
      await renderReportPdf(reportWindow, {
        html,
        orderId: order.orderId,
        fileName: `Order_${order.orderId}_Summary_Report.pdf`,
        reportType: "summary",
        previewUrl: `/api/orders/${encodeURIComponent(order.orderId)}/generated-report-pdf/summary`,
      });
    } catch (error) {
      writeReportWindowError(reportWindow, {
        title: "Summary Report Generation Failed",
        heading: "Unable to generate summary report PDF",
        message: error?.message || "Unexpected error while generating summary report PDF.",
      });
    }
  }

  function normalizeUploadSampleIdentifier(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function uploadSampleMatchesExpected(sampleValue, expectedSampleId) {
    const sampleToken = normalizeUploadSampleIdentifier(sampleValue);
    const expectedToken = normalizeUploadSampleIdentifier(expectedSampleId);
    if (!sampleToken || !expectedToken) return false;
    return (
      sampleToken === expectedToken
      || sampleToken.includes(expectedToken)
      || expectedToken.includes(sampleToken)
    );
  }

  function filterReportBySampleClient(report, expectedSampleId) {
    const normalizedExpected = normalizeUploadSampleIdentifier(expectedSampleId);
    if (!normalizedExpected) return report;

    const detailedSource = Array.isArray(report?.detailed) ? report.detailed : [];
    const filteredDetailed = detailedSource.filter((row) => uploadSampleMatchesExpected(row?.sample, expectedSampleId));
    const filteredDetected = filteredDetailed.filter((row) => String(row?.result || "").startsWith("Detected"));
    const uniqueSamples = [...new Set(filteredDetailed.map((row) => String(row?.sample || "").trim()).filter(Boolean))];

    return {
      ...report,
      summary: {
        ...(report?.summary || {}),
        sampleCount: uniqueSamples.length,
        totalRows: filteredDetailed.length,
        detectedCount: filteredDetected.length,
      },
      detected: filteredDetected,
      detailed: filteredDetailed,
    };
  }

  function extractAccessionNumbersFromReport(report) {
    return [...new Set((Array.isArray(report?.detailed) ? report.detailed : [])
      .map((row) => String(row?.sample || "").trim())
      .filter(Boolean))];
  }

async function requestRawWorkbookProcessing(file, panelName = "Lab Panel", expectedSampleId = "", orderId = "") {
  if (!csrfToken) await fetchCsrfToken();
  const contentBase64 = await fileToBase64(file);
  try {
      return await requestJson("/api/orders/process-raw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          fileName: file.name,
          contentBase64,
          panelName,
          expectedSampleId: String(expectedSampleId || "").trim(),
          orderId: String(orderId || "").trim(),
        }),
      });
    } catch (error) {
      const msg = String(error?.message || "");
      if (msg.includes("404")) {
        throw new Error("Processing endpoint not found. Restart the server and try again.");
      }
      throw error;
  }
}

async function processRawWorkbook(order, file, notes = "", options = {}) {
    const uploadedAt = String(options.uploadedAt || new Date().toISOString());
    const defaultExpectedSampleId = String(getOrderAccession(order) || "").trim();
    const expectedSampleId = String(options.expectedSampleId || defaultExpectedSampleId).trim();
    const panelName = String(options.panelName || getOrderPanelName(order) || "Lab Panel").trim() || "Lab Panel";
    const parsedResponse = options.parsedResponse
      || (await requestRawWorkbookProcessing(
        file,
        panelName,
        expectedSampleId && expectedSampleId !== "-" ? expectedSampleId : "",
        order?.orderId || ""
      ));

    const normalizedReport =
      parsedResponse?.report && typeof parsedResponse.report === "object"
        ? {
            ...parsedResponse.report,
            panelName,
          }
        : { panelName };

    const response = {
      ...parsedResponse,
      fileName: parsedResponse?.fileName || file.name,
      processedAt: parsedResponse?.processedAt || uploadedAt,
      report: normalizedReport,
    };

    const updated = await updateOrderById(order.orderId, (row) => ({
      ...row,
      status: "Processed",
      processedAt: response.processedAt,
      rawUpload: {
        fileName: response.fileName,
        uploadedAt,
        notes,
        storage: response.rawFile || row?.rawUpload?.storage || null,
      },
      processedResult: response,
    }));

    return {
      updated,
      uploadedAt,
      response,
      accessionNumbers: extractAccessionNumbersFromReport(response.report),
    };
  }

  function buildUploadResultsLogTableMarkup(logRows) {
    const rows = Array.isArray(logRows) ? logRows : [];
    if (!rows.length) {
      return '<p class="subtle upload-log-empty">No uploads recorded yet.</p>';
    }

    return `
      <div class="upload-log-table-wrap">
        <table class="order-history-table upload-log-table">
          <thead>
            <tr>
              <th>File Name</th>
              <th>Uploaded At</th>
              <th>Accession Numbers Fetched</th>
              <th>Updated Orders</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((row) => {
                const accessionText = Array.isArray(row?.accessionNumbers) && row.accessionNumbers.length
                  ? row.accessionNumbers.join(", ")
                  : "-";
                const updatedOrdersText = Array.isArray(row?.updatedOrderIds) && row.updatedOrderIds.length
                  ? row.updatedOrderIds.map((id) => `#${id}`).join(", ")
                  : row?.result === "Failed"
                  ? "Failed"
                  : "No matching pending orders";
                return `
                  <tr>
                    <td>${escapeHtml(row?.fileName || "-")}</td>
                    <td>${escapeHtml(formatOrderDate(row?.uploadedAt || ""))}</td>
                    <td>${escapeHtml(accessionText)}</td>
                    <td>${escapeHtml(updatedOrdersText)}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderUploadPanel() {
    const pendingOrders = readOrders()
      .filter((row) => row.status === "Pending")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const uploadLogRows = readUploadResultsLog();

    uploadPanelNode.innerHTML = `
      <div class="upload-results-card">
        <h4>Upload Test Results</h4>
        <div class="upload-results-grid">
          <label>
            <span>Pending Order</span>
            <select id="upload-order-id">
              <option value="">Select Order</option>
              ${pendingOrders
                .map((row) => `<option value="${row.orderId}">#${row.orderId} - ${row.patientName || "-"} (${row.patientId || "-"})</option>`)
                .join("")}
            </select>
          </label>
          <label>
            <span>Result File</span>
            <input id="upload-result-file" type="file" accept=".xlsx,.xls,.xlsm">
          </label>
          <label class="upload-full">
            <span>Bulk Result Files (Pending Orders)</span>
            <input id="upload-bulk-files" type="file" accept=".xlsx,.xls,.xlsm" multiple>
          </label>
          <label class="upload-full">
            <span>Notes</span>
            <textarea id="upload-result-notes" rows="3" placeholder="Optional notes"></textarea>
          </label>
        </div>
        <div class="upload-results-actions">
          <button type="button" id="upload-result-btn" class="btn-primary">Upload Results</button>
          <button type="button" id="upload-bulk-btn" class="btn-primary">Bulk Upload Pending Orders</button>
          <span id="upload-result-status" class="subtle">${escapeHtml(uploadStatusMessage)}</span>
        </div>
        <div class="upload-log-section">
          <h5>Upload Activity</h5>
          ${buildUploadResultsLogTableMarkup(uploadLogRows)}
        </div>
      </div>
    `;

    const uploadBtn = document.getElementById("upload-result-btn");
    const bulkUploadBtn = document.getElementById("upload-bulk-btn");

    uploadBtn?.addEventListener("click", async () => {
      const orderId = document.getElementById("upload-order-id")?.value;
      const fileInput = document.getElementById("upload-result-file");
      const notesInput = document.getElementById("upload-result-notes");
      const statusNode = document.getElementById("upload-result-status");
      const file = fileInput?.files?.[0];
      if (!orderId) {
        uploadStatusMessage = "Select a pending order.";
        if (statusNode) statusNode.textContent = uploadStatusMessage;
        return;
      }
      if (!file) {
        uploadStatusMessage = "Choose a result file to upload.";
        if (statusNode) statusNode.textContent = uploadStatusMessage;
        return;
      }

      const selectedOrder = readOrders().find((item) => Number(item.orderId) === Number(orderId));
      if (!selectedOrder) {
        uploadStatusMessage = "Selected order was not found.";
        if (statusNode) statusNode.textContent = uploadStatusMessage;
        return;
      }

      try {
        uploadStatusMessage = "Processing workbook...";
        if (statusNode) statusNode.textContent = uploadStatusMessage;
        const notes = notesInput?.value?.trim() || "";
        const result = await processRawWorkbook(selectedOrder, file, notes);
        await appendUploadResultsLog([
          {
            fileName: result?.response?.fileName || file.name,
            uploadedAt: result?.uploadedAt || new Date().toISOString(),
            accessionNumbers: result?.accessionNumbers || [],
            updatedOrderIds: result?.updated ? [String(selectedOrder.orderId || orderId)] : [],
            result: result?.updated ? "Applied" : "Failed",
          },
        ]);
        uploadStatusMessage = result?.updated
          ? `Results uploaded for Order #${orderId}. Status updated to Processed.`
          : "Unable to update order status.";
        renderUploadPanel();
        renderTable();
      } catch (error) {
        await appendUploadResultsLog([
          {
            fileName: file.name,
            uploadedAt: new Date().toISOString(),
            accessionNumbers: [],
            updatedOrderIds: [],
            result: "Failed",
          },
        ]);
        uploadStatusMessage = error?.message || "Unable to process workbook.";
        renderUploadPanel();
        renderTable();
      }
    });

    bulkUploadBtn?.addEventListener("click", async () => {
      const statusNode = document.getElementById("upload-result-status");
      const notesInput = document.getElementById("upload-result-notes");
      const bulkFilesInput = document.getElementById("upload-bulk-files");
      const files = Array.from(bulkFilesInput?.files || []);
      if (!files.length) {
        uploadStatusMessage = "Choose one or more result files for bulk upload.";
        if (statusNode) statusNode.textContent = uploadStatusMessage;
        return;
      }

      const pendingOrderRows = readOrders()
        .filter((row) => row.status === "Pending")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (!pendingOrderRows.length) {
        uploadStatusMessage = "No pending orders available for bulk upload.";
        if (statusNode) statusNode.textContent = uploadStatusMessage;
        return;
      }

      const assignedOrderIds = new Set();
      const logEntries = [];
      const notes = notesInput?.value?.trim() || "";
      let totalUpdatedOrders = 0;

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const uploadedAt = new Date().toISOString();
        uploadStatusMessage = `Processing ${file.name} (${index + 1} of ${files.length})...`;
        if (statusNode) statusNode.textContent = uploadStatusMessage;

        try {
          const parsed = await requestRawWorkbookProcessing(file, "Lab Panel", "");
          const accessionNumbers = extractAccessionNumbersFromReport(parsed?.report);
          const updatedOrderIds = [];

          for (const accessionNumber of accessionNumbers) {
            const matchingOrder = pendingOrderRows.find((row) => {
              const orderIdKey = getOrderIdMatchKey(row.orderId);
              if (assignedOrderIds.has(orderIdKey)) return false;
              return uploadSampleMatchesExpected(accessionNumber, getOrderAccession(row));
            });
            if (!matchingOrder) continue;

            const filteredReport = filterReportBySampleClient(parsed?.report || {}, accessionNumber);
            if (!Number(filteredReport?.summary?.totalRows)) continue;

            const orderId = String(matchingOrder.orderId || "").trim();
            const orderIdKey = getOrderIdMatchKey(orderId);
            const panelName = getOrderPanelName(matchingOrder);
            const responseForOrder = {
              ...parsed,
              fileName: parsed?.fileName || file.name,
              processedAt: parsed?.processedAt || uploadedAt,
              report: {
                ...filteredReport,
                panelName,
              },
            };

            const applied = await processRawWorkbook(matchingOrder, file, notes, {
              expectedSampleId: accessionNumber,
              parsedResponse: responseForOrder,
              uploadedAt,
              panelName,
            });
            if (!applied.updated) continue;
            assignedOrderIds.add(orderIdKey);
            updatedOrderIds.push(orderId);
          }

          totalUpdatedOrders += updatedOrderIds.length;
          logEntries.push({
            fileName: parsed?.fileName || file.name,
            uploadedAt,
            accessionNumbers,
            updatedOrderIds,
            result: updatedOrderIds.length ? "Applied" : "No Match",
          });
        } catch {
          logEntries.push({
            fileName: file.name,
            uploadedAt,
            accessionNumbers: [],
            updatedOrderIds: [],
            result: "Failed",
          });
        }
      }

      await appendUploadResultsLog(logEntries);
      uploadStatusMessage = totalUpdatedOrders
        ? `Bulk upload complete. Updated ${totalUpdatedOrders} pending order(s).`
        : "Bulk upload complete. No pending orders matched the uploaded accession numbers.";
      renderUploadPanel();
      renderTable();
    });
  }

  function formatOrderDate(iso) {
    return formatAppDateTime(iso, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }, "-");
  }

  function money(value) {
    return `$ ${Number(value || 0).toFixed(0)}`;
  }

  function applyFilters(items) {
    const orderIdNeedle = (orderIdInput.value || "").trim().toLowerCase();
    const fromDate = String(fromDateInput.value || "").trim();
    const toDate = String(toDateInput.value || "").trim();

    return items.filter((row) => {
      if (activeTab === "order-settlements" && row.status === "Pending") return false;
      if (activeTab === "add-service" && row.status !== "Pending") return false;
      if (orderIdNeedle && !String(row.orderId || "").toLowerCase().includes(orderIdNeedle)) return false;
      if (fromDate) {
        const value = getAppDateKey(row.createdAt);
        if (!value || value < fromDate) return false;
      }
      if (toDate) {
        const value = getAppDateKey(row.createdAt);
        if (!value || value > toDate) return false;
      }

      const patientDetails = `${row.patientName || "-"} (${row.patientId || "-"})`;
      const comparison = {
        accessionNo: getOrderAccession(row),
        patientDetails,
        provider: row.provider || "-",
        orderSource: row.orderSource || "-",
        facilityName: row.facilityName || "-",
        orderDate: formatOrderDate(row.createdAt),
        amount: money(row.amount),
        due: money(row.due),
        status: row.status || "-",
      };

      return Object.entries(filters).every(([field, needle]) => {
        if (!needle) return true;
        return String(comparison[field] || "").toLowerCase().includes(needle.toLowerCase());
      });
    });
  }

  function getValidationDialogMode(orderId = "") {
    const activeOrderId = String(previewModalNode?.getAttribute("data-validate-order-id") || "").trim();
    if (orderId && activeOrderId && activeOrderId !== String(orderId).trim()) return "validate";
    return previewModalNode?.getAttribute("data-validation-mode") === "transcribe" ? "transcribe" : "validate";
  }

  function buildReportMarkup(order, options = {}) {
    const editable = Boolean(options.editable);
    const dialogMode = editable && options.mode === "transcribe" ? "transcribe" : "validate";
    const isTranscribeMode = editable && dialogMode === "transcribe";
    const dialogTitle = editable
      ? isTranscribeMode
        ? "Result Transcribe"
        : "Result Validate"
      : "Result Preview";
    const manualTranscriptionApi = getManualTranscriptionApi();
    const transcribeUiModel = isTranscribeMode
      ? manualTranscriptionApi?.createManualTranscriptionUiModel?.({
          orderId: String(order?.orderId || "").trim(),
          panelName: order?.processedResult?.report?.panelName || getOrderPanelName(order),
          accessionNo: getOrderAccession(order),
          masterRegistryRecords,
          masterResistanceGeneCatalog,
        }) || null
      : null;
    const report = order?.processedResult?.report;
    if (!report) {
      return `
        <div class="history-preview-dialog${isTranscribeMode ? " transcribe-dialog" : ""}">
          <div class="history-preview-head">
            <h3>${dialogTitle}</h3>
            <button type="button" class="preview-close-btn" data-close-preview>×</button>
          </div>
          <div class="history-preview-body">
            <p class="subtle">No processed report found for this order.</p>
          </div>
        </div>
      `;
    }

    const detectedEntries = (Array.isArray(report.detected) ? report.detected : [])
      .map((item, index) => ({ item, sourceIndex: index }));
    const detailedEntries = (Array.isArray(report.detailed) ? report.detailed : [])
      .map((item, index) => ({ item, sourceIndex: index }));

    const isAbrGeneRow = (row) => String(row?.recordType || "").trim().toLowerCase() === "abr"
      || extractResistanceGeneNames(row?.pathogen).length > 0;
    const pathogenDetectedEntries = detectedEntries.filter(({ item }) => !isAbrGeneRow(item));
    const abrDetectedEntries = detectedEntries.filter(({ item }) => isAbrGeneRow(item));
    const pathogenDetailedEntries = detailedEntries.filter(({ item }) => !isAbrGeneRow(item));
    const abrDetailedEntries = detailedEntries.filter(({ item }) => isAbrGeneRow(item));
    const undoState = editable ? validationUndoState.get(String(order.orderId || "")) : null;

    function buildSummaryCards(entries, label) {
      if (!entries.length) {
        return `<div class="summary-empty">${isTranscribeMode ? `Analyze after adding ${label.toLowerCase()} rows to refresh this summary.` : `No ${label.toLowerCase()} detected in this report.`}</div>`;
      }
      return entries
        .slice(0, 8)
        .map(({ item, sourceIndex }) => {
          if (!editable || isTranscribeMode) {
            return `
              <div class="summary-item">
                <div class="summary-pathogen">${escapeHtml(item.pathogen || "-")}</div>
                <div class="summary-result">${escapeHtml(item.result || "-")}</div>
                <div class="summary-ct">Ct Value ${escapeHtml((item.ctValue ?? item.ctRaw) || "-")}</div>
              </div>
            `;
          }
          return `
            <div class="summary-item summary-item-edit">
              <input class="preview-edit-input" data-validate-field="pathogen" data-validate-section="detected" data-validate-index="${sourceIndex}" value="${escapeHtml(item.pathogen || "")}" placeholder="${escapeHtml(label)}">
              <input class="preview-edit-input" data-validate-field="result" data-validate-section="detected" data-validate-index="${sourceIndex}" value="${escapeHtml(item.result || "")}" placeholder="Result">
              <input class="preview-edit-input" data-validate-field="ctValue" data-validate-section="detected" data-validate-index="${sourceIndex}" value="${escapeHtml((item.ctValue ?? item.ctRaw) || "")}" placeholder="Ct Value">
            </div>
          `;
        })
        .join("");
    }

    function buildDetailedRows(entries, label, addType) {
      const dataRows = entries.length
        ? entries
            .slice(0, 220)
            .map(({ item, sourceIndex }) => {
              if (!editable) {
                return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(item.pathogen || "-")}</strong>
                      <div class="subtle">${escapeHtml(item.sample || "-")} ${item.well ? `| Well ${escapeHtml(item.well)}` : ""}</div>
                    </td>
                    <td>${escapeHtml(item.result || "-")}</td>
                    <td>${escapeHtml((item.ctValue ?? item.ctRaw) || "-")}</td>
                  </tr>
                `;
              }
              if (isTranscribeMode) {
                const transcribeTargetMarkup = manualTranscriptionApi?.buildManualTranscriptionTargetFieldMarkup?.({
                  model: transcribeUiModel,
                  item,
                  kind: addType === "abr" ? "abr" : "pathogen",
                  sourceIndex,
                  section: "detailed",
                  escapeHtml,
                }) || `
                  <input class="preview-edit-input" data-validate-field="pathogen" data-validate-section="detailed" data-validate-index="${sourceIndex}" value="${escapeHtml(item.pathogen || "")}" placeholder="${escapeHtml(label)}">
                `;
                const transcribeResultMarkup = manualTranscriptionApi?.buildManualTranscriptionResultFieldMarkup?.({
                  model: transcribeUiModel,
                  value: item.result || "",
                  sourceIndex,
                  section: "detailed",
                  escapeHtml,
                }) || `
                  <input class="preview-edit-input" data-validate-field="result" data-validate-section="detailed" data-validate-index="${sourceIndex}" value="${escapeHtml(item.result || "")}" placeholder="Result">
                `;
                return `
                  <tr>
                    <td class="lab-detail-primary-cell">
                      <div class="lab-detail-row-head">
                        ${transcribeTargetMarkup}
                        <button
                          type="button"
                          class="lab-detail-remove-btn"
                          data-remove-validate-row="${sourceIndex}"
                          data-order-id="${escapeHtml(order.orderId || "")}"
                          aria-label="Remove ${escapeHtml(label)} row"
                        >
                          Remove
                        </button>
                      </div>
                      <div class="transcribe-row-meta">
                        <span class="transcribe-row-chip">${escapeHtml(item.sample || "-")}</span>
                        ${item.well ? `<span class="transcribe-row-chip">Well ${escapeHtml(item.well)}</span>` : ""}
                      </div>
                    </td>
                    <td>${transcribeResultMarkup}</td>
                    <td>
                      <input
                        class="preview-edit-input transcribe-ct-input"
                        data-validate-field="ctValue"
                        data-validate-section="detailed"
                        data-validate-index="${sourceIndex}"
                        value="${escapeHtml((item.ctValue ?? item.ctRaw) || "")}"
                        placeholder="Ct Value"
                      >
                    </td>
                  </tr>
                `;
              }
              return `
                <tr>
                  <td class="lab-detail-primary-cell">
                    <div class="lab-detail-row-head">
                      <input class="preview-edit-input" data-validate-field="pathogen" data-validate-section="detailed" data-validate-index="${sourceIndex}" value="${escapeHtml(item.pathogen || "")}" placeholder="${escapeHtml(label)}">
                      <button
                        type="button"
                        class="lab-detail-remove-btn"
                        data-remove-validate-row="${sourceIndex}"
                        data-order-id="${escapeHtml(order.orderId || "")}"
                        aria-label="Remove ${escapeHtml(label)} row"
                      >
                        Remove
                      </button>
                    </div>
                    <div class="subtle">${escapeHtml(item.sample || "-")} ${item.well ? `| Well ${escapeHtml(item.well)}` : ""}</div>
                  </td>
                  <td><input class="preview-edit-input" data-validate-field="result" data-validate-section="detailed" data-validate-index="${sourceIndex}" value="${escapeHtml(item.result || "")}" placeholder="Result"></td>
                  <td><input class="preview-edit-input" data-validate-field="ctValue" data-validate-section="detailed" data-validate-index="${sourceIndex}" value="${escapeHtml((item.ctValue ?? item.ctRaw) || "")}" placeholder="Ct Value"></td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="3">No ${label.toLowerCase()} rows available.</td></tr>`;

      if (!editable) return dataRows;
      return `
        ${dataRows}
        <tr class="lab-detail-add-row">
          <td colspan="3">
            <button
              type="button"
              class="lab-detail-add-btn"
              data-add-validate-row="${escapeHtml(addType)}"
              data-order-id="${escapeHtml(order.orderId || "")}"
            >
              <span class="lab-detail-add-icon">+</span>
              <span>Add ${escapeHtml(label)}</span>
            </button>
          </td>
        </tr>
      `;
    }

    const pathogenSummaryRows = buildSummaryCards(pathogenDetectedEntries, "Pathogen");
    const abrSummaryRows = buildSummaryCards(abrDetectedEntries, "ABR Gene");
    const pathogenDetailRowsMarkup = buildDetailedRows(pathogenDetailedEntries, "Pathogen", "pathogen");
    const abrDetailRowsMarkup = buildDetailedRows(abrDetailedEntries, "ABR Gene", "abr");
    const manualEditNote = getValidationManualEditNote(report);
    const transcribeIntroMarkup = isTranscribeMode
      ? manualTranscriptionApi?.buildManualTranscriptionIntroMarkup?.(transcribeUiModel, escapeHtml) || ""
      : "";
    const transcribeLookupMarkup = isTranscribeMode
      ? manualTranscriptionApi?.buildManualTranscriptionLookupMarkup?.(transcribeUiModel, escapeHtml) || ""
      : "";

    return `
      <div class="history-preview-dialog${isTranscribeMode ? " transcribe-dialog" : ""}">
        <div class="history-preview-head">
          <h3>${dialogTitle} • Order #${escapeHtml(order.orderId || "-")}</h3>
          <button type="button" class="preview-close-btn" data-close-preview>×</button>
        </div>
        <div class="history-preview-body">
          <article class="lab-report-preview${isTranscribeMode ? " transcribe-workbench" : ""}">
            ${transcribeLookupMarkup}
            ${transcribeIntroMarkup}
            <h2 class="lab-panel-title">${escapeHtml(report.panelName || getOrderPanelName(order))}</h2>
            ${
              isTranscribeMode
                ? `
                  <section class="validation-note-card">
                    <p class="subtle">Enter result rows manually for this order, then click Analyze to refresh the detected summary before saving.</p>
                  </section>
                `
                : ""
            }
            <h3 class="lab-summary-title">Summary Lab Report</h3>
            <div class="lab-blue-bar">Pathogens Detected</div>
            <div class="lab-summary-grid">${pathogenSummaryRows}</div>
            <div class="lab-blue-bar">ABR Genes Detected</div>
            <div class="lab-summary-grid">${abrSummaryRows}</div>
            <aside class="ct-reference-box">
              *Microbial Load Classification (Ct Value): 0–25: High Pathogen Load; 26–30: Moderate Pathogen Load; 31–33: Low Pathogen Load; >33: Negative
            </aside>
            <h3 class="lab-detail-title">Detailed Lab Report</h3>
            <table class="lab-detail-table">
              <thead>
                <tr>
                  <th>Pathogens</th>
                  <th>Result</th>
                  <th>CT Value</th>
                </tr>
              </thead>
              <tbody>
                ${pathogenDetailRowsMarkup}
              </tbody>
            </table>
            <table class="lab-detail-table">
              <thead>
                <tr>
                  <th>ABR Genes</th>
                  <th>Result</th>
                  <th>CT Value</th>
                </tr>
              </thead>
              <tbody>
                ${abrDetailRowsMarkup}
              </tbody>
            </table>
            ${
              editable
                ? `
                  <section class="validation-note-card">
                    <label class="validation-note-label" for="validate-manual-note-${escapeHtml(order.orderId || "")}">
                      <span>Manual Edit Note</span>
                      <textarea
                        id="validate-manual-note-${escapeHtml(order.orderId || "")}"
                        class="validation-note-input"
                        data-validate-note
                        rows="3"
                        placeholder="Add a note for any manual ABR edit before saving."
                      >${escapeHtml(manualEditNote)}</textarea>
                    </label>
                    <p class="validation-note-hint" data-validate-note-hint>
                      Add a note whenever you manually edit ABR results.
                    </p>
                  </section>
                `
                : ""
            }
            ${
              editable && undoState
                ? `
                  <div class="validation-undo-banner">
                    <span>${escapeHtml(undoState.message || "Row removed.")}</span>
                    <div class="validation-undo-actions">
                      <button type="button" class="validation-undo-btn" data-undo-validate-row="${escapeHtml(order.orderId)}">Undo</button>
                      <button type="button" class="validation-undo-dismiss" data-dismiss-validate-undo="${escapeHtml(order.orderId)}" aria-label="Dismiss remove notice">×</button>
                    </div>
                  </div>
                `
                : ""
            }
            ${
              editable
                ? `
                  <div class="history-preview-actions">
                    <button type="button" class="table-action-btn preview-btn" data-analyze-validate="${escapeHtml(order.orderId)}">Analyze</button>
                    <button type="button" class="table-action-btn validate-btn" data-save-validate="${escapeHtml(order.orderId)}">${isTranscribeMode ? "Save Transcribe" : "Save Validate"}</button>
                    <button type="button" class="table-action-btn" data-close-preview>Cancel</button>
                  </div>
                `
                : ""
            }
          </article>
        </div>
      </div>
    `;
  }

  function openPreview(orderId) {
    const order = readOrders().find((item) => Number(item.orderId) === Number(orderId));
    previewModalNode.removeAttribute("data-validate-order-id");
    previewModalNode.removeAttribute("data-validation-mode");
    previewModalNode.innerHTML = buildReportMarkup(order, { editable: false });
    previewModalNode.classList.remove("hidden");
  }

  function cloneValidationReport(report) {
    if (!report || typeof report !== "object") return null;
    return {
      ...report,
      summary: report.summary && typeof report.summary === "object" ? { ...report.summary } : report.summary,
      metadata: report.metadata && typeof report.metadata === "object" ? { ...report.metadata } : report.metadata,
      detected: Array.isArray(report.detected) ? report.detected.map((row) => ({ ...row })) : [],
      detailed: Array.isArray(report.detailed) ? report.detailed.map((row) => ({ ...row })) : [],
    };
  }

  function getValidationManualEditNote(report) {
    return String(report?.metadata?.manualEditNote || "").trim();
  }

  function serializeValidationReportForComparison(report) {
    if (!report || typeof report !== "object") return "";
    const metadata = report.metadata && typeof report.metadata === "object"
      ? Object.fromEntries(
          Object.entries(report.metadata).filter(([key]) => key !== "manualEditNote")
        )
      : {};
    return JSON.stringify({
      panelName: String(report.panelName || ""),
      summary: report.summary && typeof report.summary === "object" ? report.summary : {},
      metadata,
      detected: Array.isArray(report.detected) ? report.detected : [],
      detailed: Array.isArray(report.detailed) ? report.detailed : [],
    });
  }

  function reportHasManualValidationEdits(currentReport, originalReport) {
    return serializeValidationReportForComparison(currentReport) !== serializeValidationReportForComparison(originalReport);
  }

  function collectValidationModalReport(baseReport) {
    const nextReport = cloneValidationReport(baseReport);
    if (!nextReport) return null;
    previewModalNode.querySelectorAll("[data-validate-field]").forEach((input) => {
      const section = input.getAttribute("data-validate-section");
      const field = input.getAttribute("data-validate-field");
      const index = Number(input.getAttribute("data-validate-index"));
      if (!section || !field || Number.isNaN(index)) return;
      const rows = nextReport[section];
      if (!Array.isArray(rows) || !rows[index]) return;
      const value = String(input.value || "").trim();
      rows[index][field] = value;
      if (field === "ctValue") rows[index].ctRaw = value;
    });
    const noteInput = previewModalNode.querySelector("[data-validate-note]");
    const noteValue = String(noteInput?.value || "").trim();
    nextReport.metadata = nextReport.metadata && typeof nextReport.metadata === "object"
      ? { ...nextReport.metadata }
      : {};
    nextReport.metadata.manualEditNote = noteValue;
    return nextReport;
  }

  function getValidationSaveState(orderId) {
    const order = readOrders().find((item) => Number(item.orderId) === Number(orderId));
    const originalReport = order?.processedResult?.report;
    const draftBaseReport = validationDraftReports.get(String(orderId)) || originalReport;
    const currentReport = draftBaseReport ? collectValidationModalReport(draftBaseReport) : null;
    const hasManualEdits = Boolean(currentReport && originalReport && reportHasManualValidationEdits(currentReport, originalReport));
    const noteValue = getValidationManualEditNote(currentReport);
    return {
      currentReport,
      hasManualEdits,
      noteValue,
      noteRequired: hasManualEdits && !noteValue,
    };
  }

  function updateValidationSaveState(orderId) {
    const saveBtn = previewModalNode?.querySelector("[data-save-validate]");
    const noteHint = previewModalNode?.querySelector("[data-validate-note-hint]");
    if (!saveBtn) return;
    const saveState = getValidationSaveState(orderId);
    saveBtn.disabled = saveState.noteRequired;
    saveBtn.setAttribute("aria-disabled", saveState.noteRequired ? "true" : "false");
    if (noteHint) {
      noteHint.textContent = saveState.noteRequired
        ? "Add a note before saving manual edits."
        : "Add a note whenever you manually edit ABR results.";
      noteHint.classList.toggle("validation-note-hint-required", saveState.noteRequired);
    }
  }

  function getCurrentValidationReport(orderId) {
    const orderKey = String(orderId);
    const order = readOrders().find((item) => Number(item.orderId) === Number(orderId));
    if (!order) return { order: null, report: null };
    const baseReport = validationDraftReports.get(orderKey) || order?.processedResult?.report;
    if (!baseReport) return { order, report: null };
    const activeValidateOrderId = previewModalNode.getAttribute("data-validate-order-id");
    if (String(activeValidateOrderId || "") === orderKey) {
      const editedReport = collectValidationModalReport(baseReport);
      if (editedReport) {
        validationDraftReports.set(orderKey, editedReport);
        return { order, report: editedReport };
      }
    }
    return { order, report: cloneValidationReport(baseReport) };
  }

  function recalculateDetectedRows(report) {
    const nextReport = cloneValidationReport(report);
    if (!nextReport) return null;
    const detailedRows = Array.isArray(nextReport.detailed) ? nextReport.detailed : [];
    const detectedRows = detailedRows
      .filter((row) => isDetectedResult(row?.result))
      .map((row) => ({ ...row }));
    const sampleCount = [...new Set(detailedRows.map((row) => String(row?.sample || "").trim()).filter(Boolean))].length;
    nextReport.detected = detectedRows;
    nextReport.summary = {
      ...(nextReport.summary && typeof nextReport.summary === "object" ? nextReport.summary : {}),
      sampleCount,
      totalRows: detailedRows.length,
      detectedCount: detectedRows.length,
    };
    return nextReport;
  }

  function captureValidationModalScrollState() {
    const bodyNode = previewModalNode?.querySelector(".history-preview-body");
    if (!bodyNode) return null;
    return {
      top: bodyNode.scrollTop,
      height: bodyNode.scrollHeight,
    };
  }

  function restoreValidationModalScrollState(scrollState, options = {}) {
    if (!scrollState) return;
    const bodyNode = previewModalNode?.querySelector(".history-preview-body");
    if (!bodyNode) return;
    const preserveBottomOffset = options.preserveBottomOffset !== false;
    const nextTop = preserveBottomOffset
      ? scrollState.top + Math.max(0, bodyNode.scrollHeight - scrollState.height)
      : scrollState.top;
    bodyNode.scrollTop = nextTop;
  }

  function openValidate(orderId, reportOverride = null, options = {}) {
    const order = readOrders().find((item) => Number(item.orderId) === Number(orderId));
    if (!order) return;
    const orderKey = String(orderId);
    const dialogMode = options.mode === "transcribe" ? "transcribe" : getValidationDialogMode(orderId);
    const draftReport = cloneValidationReport(
      reportOverride
      || validationDraftReports.get(orderKey)
      || order?.processedResult?.report
    );
    if (draftReport) validationDraftReports.set(orderKey, draftReport);
    const orderForMarkup = draftReport
      ? {
          ...order,
          processedResult: {
            ...(order.processedResult || {}),
            report: draftReport,
          },
        }
      : order;
    previewModalNode.setAttribute("data-validate-order-id", orderKey);
    previewModalNode.setAttribute("data-validation-mode", dialogMode);
    previewModalNode.innerHTML = buildReportMarkup(orderForMarkup, { editable: true, mode: dialogMode });
    previewModalNode.classList.remove("hidden");
    updateValidationSaveState(orderId);
    if (options.scrollState) {
      requestAnimationFrame(() => {
        restoreValidationModalScrollState(options.scrollState, options);
      });
    }
  }

  function openTranscribe(orderId) {
    const order = readOrders().find((item) => Number(item.orderId) === Number(orderId));
    if (!order) return;
    const orderKey = String(orderId);
    const draftReport = cloneValidationReport(order?.processedResult?.report)
      || getManualTranscriptionApi()?.createManualTranscriptionReport?.({
        panelName: getOrderPanelName(order),
        accessionNo: getOrderAccession(order),
      });
    validationDraftReports.set(orderKey, draftReport);
    validationUndoState.delete(orderKey);
    openValidate(orderId, draftReport, { mode: "transcribe" });
  }

  async function saveValidation(orderId) {
    const orderKey = String(orderId);
    const order = readOrders().find((item) => Number(item.orderId) === Number(orderId));
    const baseReport = validationDraftReports.get(orderKey) || order?.processedResult?.report;
    if (!baseReport) return false;
    const dialogMode = getValidationDialogMode(orderId);
    const nextReport = collectValidationModalReport(baseReport);
    if (!nextReport) return false;
    const normalizedReport = dialogMode === "transcribe"
      ? getManualTranscriptionApi()?.normalizeManualTranscriptionReport?.(nextReport) || nextReport
      : recalculateDetectedRows(nextReport) || nextReport;
    validationDraftReports.set(orderKey, normalizedReport);
    validationUndoState.delete(orderKey);
    const isFirstManualTranscription = !order?.processedResult?.report;
    return updateOrderById(orderId, (row) => {
      const processedAt = row.processedAt || row?.processedResult?.processedAt || new Date().toISOString();
      const manualMetadata = isFirstManualTranscription
        ? {
            fileName: row?.processedResult?.fileName || "Manual transcription",
            source: row?.processedResult?.source || "manual-transcription",
          }
        : {};

      return {
        ...row,
        status: isFirstManualTranscription
          ? getManualTranscriptionApi()?.resolveManualTranscriptionStatus?.(row.status) || row.status || "Processed"
          : row.status,
        processedAt,
        processedResult: {
          ...(row.processedResult || {}),
          ...manualMetadata,
          processedAt: row?.processedResult?.processedAt || processedAt,
          report: normalizedReport,
        },
      };
    });
  }

  function analyzeValidation(orderId) {
    const { report: editedReport } = getCurrentValidationReport(orderId);
    if (!editedReport) return false;
    const analyzedReport = getValidationDialogMode(orderId) === "transcribe"
      ? getManualTranscriptionApi()?.normalizeManualTranscriptionReport?.(editedReport)
      : recalculateDetectedRows(editedReport);
    if (!analyzedReport) return false;
    validationDraftReports.set(String(orderId), analyzedReport);
    openValidate(orderId, analyzedReport, {
      scrollState: captureValidationModalScrollState(),
      preserveBottomOffset: false,
    });
    return true;
  }

  function addValidationDetailedRow(orderId, type) {
    const orderKey = String(orderId);
    const { order, report } = getCurrentValidationReport(orderId);
    if (!report) return false;
    const nextReport = cloneValidationReport(report);
    if (!nextReport) return false;
    if (!Array.isArray(nextReport.detailed)) nextReport.detailed = [];
    const defaultSampleId = String(
      nextReport?.metadata?.defaultSampleId
      || getOrderAccession(order)
      || ""
    ).trim();
    nextReport.detailed.push({
      sample: defaultSampleId && defaultSampleId !== "-" ? defaultSampleId : "",
      well: "",
      pathogen: "",
      ampStatus: "-",
      ctValue: "",
      ctRaw: "",
      result: "Not Detected",
      classification: "Negative",
      recordType: type === "abr" ? "abr" : "pathogen",
    });
    validationDraftReports.set(orderKey, nextReport);
    openValidate(orderId, nextReport, {
      scrollState: captureValidationModalScrollState(),
      preserveBottomOffset: true,
    });
    return true;
  }

  function removeValidationDetailedRow(orderId, index) {
    const orderKey = String(orderId);
    const { report } = getCurrentValidationReport(orderId);
    if (!report || !Array.isArray(report.detailed)) return false;
    if (index < 0 || index >= report.detailed.length) return false;
    const nextReport = cloneValidationReport(report);
    if (!nextReport || !Array.isArray(nextReport.detailed)) return false;
    const [removedRow] = nextReport.detailed.splice(index, 1);
    if (!removedRow) return false;
    const refreshedReport = recalculateDetectedRows(nextReport) || nextReport;
    const isAbrRow = String(removedRow.recordType || "").trim().toLowerCase() === "abr"
      || extractResistanceGeneNames(removedRow.pathogen).length > 0;
    const itemLabel = String(removedRow.pathogen || "").trim() || (isAbrRow ? "ABR gene row" : "Pathogen row");
    validationDraftReports.set(orderKey, refreshedReport);
    validationUndoState.set(orderKey, {
      row: removedRow,
      index,
      message: `${itemLabel} removed.`,
    });
    openValidate(orderId, refreshedReport, {
      scrollState: captureValidationModalScrollState(),
      preserveBottomOffset: false,
    });
    return true;
  }

  function undoValidationDetailedRow(orderId) {
    const orderKey = String(orderId);
    const undoState = validationUndoState.get(orderKey);
    if (!undoState?.row) return false;
    const { report } = getCurrentValidationReport(orderId);
    if (!report) return false;
    const nextReport = cloneValidationReport(report);
    if (!nextReport) return false;
    if (!Array.isArray(nextReport.detailed)) nextReport.detailed = [];
    const insertIndex = Math.max(0, Math.min(Number(undoState.index) || 0, nextReport.detailed.length));
    nextReport.detailed.splice(insertIndex, 0, { ...undoState.row });
    const refreshedReport = recalculateDetectedRows(nextReport) || nextReport;
    validationDraftReports.set(orderKey, refreshedReport);
    validationUndoState.delete(orderKey);
    openValidate(orderId, refreshedReport, {
      scrollState: captureValidationModalScrollState(),
      preserveBottomOffset: false,
    });
    return true;
  }

  function dismissValidationUndo(orderId) {
    const orderKey = String(orderId);
    if (!validationUndoState.has(orderKey)) return false;
    const { report } = getCurrentValidationReport(orderId);
    if (report) validationDraftReports.set(orderKey, report);
    validationUndoState.delete(orderKey);
    openValidate(orderId, report || null, {
      scrollState: captureValidationModalScrollState(),
      preserveBottomOffset: false,
    });
    return true;
  }

  function closePreview() {
    const activeValidateOrderId = previewModalNode.getAttribute("data-validate-order-id");
    if (activeValidateOrderId) validationDraftReports.delete(activeValidateOrderId);
    if (activeValidateOrderId) validationUndoState.delete(activeValidateOrderId);
    previewModalNode.removeAttribute("data-validate-order-id");
    previewModalNode.removeAttribute("data-validation-mode");
    previewModalNode.classList.add("hidden");
    previewModalNode.innerHTML = "";
  }

  function renderTable() {
    const activeFilterInput = document.activeElement?.closest?.(".history-filter-input");
    const activeFilterField = activeFilterInput?.getAttribute("data-filter-field") || "";
    const activeFilterSelectionStart = activeFilterInput?.selectionStart;
    const activeFilterSelectionEnd = activeFilterInput?.selectionEnd;
    const showRawUploadColumn = shouldShowRawUploadColumn();
    const showClientResultPreview = activeSession.type === "client" && activeTab === "all-orders";
    const showResultActionColumns = activeSession.type !== "client" || activeTab !== "all-orders";
    const visibleColumnCount = Object.keys(headerMap)
      .filter((key) => showRawUploadColumn || key !== "uploadRaw")
      .filter((key) => showClientResultPreview || key !== "resultPreview")
      .filter((key) => showResultActionColumns || !["reviewAction", "preview", "reportActions", "publishReport"].includes(key))
      .length;
    const rows = applyFilters(readOrders()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (openReportMenuOrderId && !rows.some((row) => String(row?.orderId || "").trim() === openReportMenuOrderId)) {
      openReportMenuOrderId = "";
    }
    if (openReviewMenuOrderId && !rows.some((row) => String(row?.orderId || "").trim() === openReviewMenuOrderId)) {
      openReviewMenuOrderId = "";
    }
    tableNode.innerHTML = `
      <div class="order-history-meta">Rows: ${rows.length}</div>
      <table class="order-history-table">
        <thead>
          <tr>
            ${Object.entries(headerMap)
              .filter(([key]) => showRawUploadColumn || key !== "uploadRaw")
              .filter(([key]) => showClientResultPreview || key !== "resultPreview")
              .filter(([key]) => showResultActionColumns || !["reviewAction", "preview", "reportActions", "publishReport"].includes(key))
              .map(([key, title]) => {
                const headerClass = headerClassMap[key];
                return `<th${headerClass ? ` class="${headerClass}"` : ""}>${title}</th>`;
              })
              .join("")}
          </tr>
          <tr>
            <th></th>
            <th><input data-filter-field="accessionNo" class="history-filter-input" placeholder="Filter"></th>
            <th><input data-filter-field="patientDetails" class="history-filter-input" placeholder="Filter"></th>
            <th><input data-filter-field="provider" class="history-filter-input" placeholder="Filter"></th>
            <th><input data-filter-field="orderSource" class="history-filter-input" placeholder="Filter"></th>
            <th><input data-filter-field="facilityName" class="history-filter-input" placeholder="Filter"></th>
            <th><input data-filter-field="orderDate" class="history-filter-input" placeholder="Filter"></th>
            <th><input data-filter-field="amount" class="history-filter-input" placeholder="Filter"></th>
            <th><input data-filter-field="due" class="history-filter-input" placeholder="Filter"></th>
            ${showRawUploadColumn ? "<th></th>" : ""}
            <th><input data-filter-field="status" class="history-filter-input" placeholder="Filter"></th>
            ${showClientResultPreview ? "<th></th>" : ""}
            ${
              showResultActionColumns
                ? `
                  <th class="review-action-col"></th>
                  <th></th>
                  <th class="reports-action-col"></th>
                  <th class="report-action-col"></th>
                `
                : ""
            }
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows
            .map((row) => {
              const statusClass =
                row.status === "Processed"
                  ? "status-processed"
                  : row.status === "Complete"
                  ? "status-complete"
                  : row.status === "Rejected"
                  ? "status-rejected"
                  : "status-pending";
              const isBusy = processingOrders.has(Number(row.orderId));
              const isGenerating = generatingReports.has(Number(row.orderId));
              const isGeneratingSummary = generatingSummaryReports.has(Number(row.orderId));
              const isGeneratingFinal = generatingFinalReports.has(Number(row.orderId));
              const isPublishingFinal = publishingFinalReports.has(Number(row.orderId));
              const isOpeningResultPreview = openingResultPreviews.has(String(row.orderId));
              const isPharmdBypassed = isPharmdSkipped(row);
              const canPreviewResult = isPharmdBypassed ? hasSavedFinalReport(row) : canPreviewCombinedPharmdReport(row);
              return `
                <tr>
                  <td>${row.orderId}</td>
                  <td>${escapeHtml(getOrderAccession(row))}</td>
                  <td>
                    <strong>${row.patientName || "-"}</strong>
                    <div class="subtle">(${row.patientId || "-"})</div>
                  </td>
                  <td>${row.provider || "-"}</td>
                  <td>${row.orderSource || "-"}</td>
                  <td>${row.facilityName || "-"}</td>
                  <td>${formatOrderDate(row.createdAt)}</td>
                  <td>${money(row.amount)}</td>
                  <td>${money(row.due)}</td>
                  ${
                    showRawUploadColumn
                      ? `
                        <td>
                          <div class="raw-upload-cell">
                            <input type="file" class="raw-upload-input" data-upload-file="${row.orderId}" accept=".xlsx,.xls,.xlsm">
                            <button type="button" class="table-action-btn" data-process-order="${row.orderId}" ${isBusy ? "disabled" : ""}>
                              ${isBusy ? "Processing..." : "Process"}
                            </button>
                          </div>
                          ${row.rawUpload?.fileName ? `<div class="subtle">${escapeHtml(row.rawUpload.fileName)}</div>` : ""}
                        </td>
                      `
                      : ""
                  }
                  <td><span class="history-status ${statusClass}">${row.status || "-"}</span></td>
                  ${
                    showClientResultPreview
                      ? `
                        <td class="output-results-preview-cell">
                          <button
                            type="button"
                            class="table-action-btn preview-btn"
                            data-preview-result="${escapeHtml(row.orderId)}"
                            ${canPreviewResult && !isOpeningResultPreview ? "" : "disabled"}
                          >
                            ${isOpeningResultPreview ? "Opening..." : "Preview"}
                          </button>
                          <div class="subtle output-results-inline-note">
                            ${isPharmdBypassed
                              ? (canPreviewResult ? "Preview the saved final report." : "Requires a saved final report.")
                              : (canPreviewResult ? "Preview the combined PharmD and final report PDF." : "Requires saved final report and PharmD file.")}
                          </div>
                        </td>
                      `
                      : ""
                  }
                  ${
                    showResultActionColumns
                      ? `
                        <td>${buildReviewActionMarkup(row)}</td>
                        <td>
                          ${
                            row.processedResult?.report
                              ? `<button type="button" class="table-action-btn preview-btn" data-preview-order="${row.orderId}">Preview</button>`
                              : `<span class="subtle">-</span>`
                          }
                        </td>
                        <td class="reports-action-cell">
                          ${buildReportsActionMarkup(row, { isGenerating, isGeneratingSummary, isGeneratingFinal })}
                        </td>
                        <td class="report-action-cell">
                          ${
                            row.processedResult?.report
                              ? `<button type="button" class="table-action-btn publish-report-btn" data-publish-final-report-order="${row.orderId}" ${isPublishingFinal ? "disabled" : ""}>${isPublishingFinal ? "PrePublishing..." : "PrePublish"}</button>`
                              : `<span class="subtle">-</span>`
                          }
                        </td>
                      `
                      : ""
                  }
                </tr>
              `;
            })
            .join("") : `<tr><td colspan="${visibleColumnCount}" class="table-empty">No orders found.</td></tr>`}
        </tbody>
      </table>
    `;

    tableNode.querySelectorAll(".history-filter-input").forEach((input) => {
      const field = input.getAttribute("data-filter-field");
      if (field) input.value = filters[field] || "";
    });

    if (activeFilterField) {
      const nextActiveFilterInput = tableNode.querySelector(`[data-filter-field="${activeFilterField}"]`);
      nextActiveFilterInput?.focus();
      if (
        typeof activeFilterSelectionStart === "number"
        && typeof activeFilterSelectionEnd === "number"
      ) {
        nextActiveFilterInput?.setSelectionRange(activeFilterSelectionStart, activeFilterSelectionEnd);
      }
    }
  }

  tableNode.addEventListener("click", async (event) => {
    const resultPreviewBtn = event.target.closest("[data-preview-result]");
    if (resultPreviewBtn) {
      const orderId = String(resultPreviewBtn.getAttribute("data-preview-result") || "").trim();
      const order = readOrders().find((item) => String(item?.orderId || "").trim() === orderId);
      if (!order || openingResultPreviews.has(orderId)) return;

      const isPharmdBypassed = isPharmdSkipped(order);
      const endpoint = isPharmdBypassed
        ? `/api/orders/${encodeURIComponent(orderId)}/final-report-pdf`
        : `/api/pharmd/orders/${encodeURIComponent(orderId)}/combined-report-pdf`;
      const previewWindow = window.open("", "_blank", "popup=yes,width=1080,height=860");
      if (!previewWindow) {
        alert("Unable to open preview window. Please allow pop-ups and try again.");
        return;
      }
      previewWindow.document.write("<p style=\"font-family:Arial,sans-serif;padding:24px\">Loading report preview...</p>");
      previewWindow.document.close();
      openingResultPreviews.add(orderId);
      renderTable();
      try {
        const response = await fetch(endpoint, { credentials: "same-origin" });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || "Unable to load the report preview.");
        }
        const blob = await response.blob();
        if (!blob.size) throw new Error("The report preview is empty.");
        const blobUrl = URL.createObjectURL(blob);
        previewWindow.location.replace(blobUrl);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60 * 1000);
      } catch (error) {
        previewWindow.document.open();
        previewWindow.document.write(`<p style="font-family:Arial,sans-serif;padding:24px">${escapeHtml(error?.message || "Unable to load the report preview.")}</p>`);
        previewWindow.document.close();
      } finally {
        openingResultPreviews.delete(orderId);
        renderTable();
      }
      return;
    }

    const processBtn = event.target.closest("[data-process-order]");
    if (processBtn) {
      const orderId = processBtn.getAttribute("data-process-order");
      const fileInput = tableNode.querySelector(`input[data-upload-file="${orderId}"]`);
      const file = fileInput?.files?.[0];
      if (!orderId || !file) {
        alert("Please choose an Excel file before processing.");
        return;
      }

      const order = readOrders().find((item) => Number(item.orderId) === Number(orderId));
      if (!order) {
        alert("Order not found.");
        return;
      }

      try {
        processingOrders.add(Number(orderId));
        renderTable();
        await processRawWorkbook(order, file);
        processingOrders.delete(Number(orderId));
        renderTable();
      } catch (error) {
        processingOrders.delete(Number(orderId));
        renderTable();
        alert(error?.message || "Unable to process workbook.");
      }
      return;
    }

    const reviewPrimaryBtn = event.target.closest("[data-review-menu-primary]");
    if (reviewPrimaryBtn) {
      const orderId = String(reviewPrimaryBtn.getAttribute("data-review-menu-primary") || "").trim();
      const actionKey = String(reviewPrimaryBtn.getAttribute("data-review-menu-default-action") || "").trim();
      closeReviewMenu();
      renderTable();
      await runOrderHistoryReviewAction(orderId, actionKey);
      return;
    }

    const reviewMenuTrigger = event.target.closest("[data-review-menu-trigger]");
    if (reviewMenuTrigger) {
      const orderId = String(reviewMenuTrigger.getAttribute("data-review-menu-trigger") || "").trim();
      if (!orderId) return;
      closeReportMenu();
      openReviewMenuOrderId = openReviewMenuOrderId === orderId ? "" : orderId;
      renderTable();
      return;
    }

    const reviewMenuActionBtn = event.target.closest("[data-review-menu-action]");
    if (reviewMenuActionBtn) {
      const orderId = String(reviewMenuActionBtn.getAttribute("data-order-id") || "").trim();
      const actionKey = String(reviewMenuActionBtn.getAttribute("data-review-menu-action") || "").trim();
      if (!orderId) return;
      closeReviewMenu();
      renderTable();
      await runOrderHistoryReviewAction(orderId, actionKey);
      return;
    }

    const previewBtn = event.target.closest("[data-preview-order]");
    if (previewBtn) {
      const orderId = previewBtn.getAttribute("data-preview-order");
      if (orderId) openPreview(orderId);
      return;
    }

    const reportMenuTrigger = event.target.closest("[data-report-menu-trigger]");
    if (reportMenuTrigger) {
      const orderId = String(reportMenuTrigger.getAttribute("data-report-menu-trigger") || "").trim();
      if (!orderId) return;
      closeReviewMenu();
      openReportMenuOrderId = openReportMenuOrderId === orderId ? "" : orderId;
      renderTable();
      return;
    }

    const reportMenuActionBtn = event.target.closest("[data-report-menu-action]");
    if (reportMenuActionBtn) {
      const orderId = String(reportMenuActionBtn.getAttribute("data-order-id") || "").trim();
      const actionKey = String(reportMenuActionBtn.getAttribute("data-report-menu-action") || "").trim();
      if (!orderId) return;
      closeReportMenu();
      renderTable();
      await runOrderHistoryReportAction(orderId, actionKey);
      return;
    }

    const publishFinalReportBtn = event.target.closest("[data-publish-final-report-order]");
    if (publishFinalReportBtn) {
      const orderId = publishFinalReportBtn.getAttribute("data-publish-final-report-order");
      if (!orderId) return;
      const numericId = Number(orderId);
      if (publishingFinalReports.has(numericId)) return;
      publishingFinalReports.add(numericId);
      renderTable();
      try {
        await prepublishFinalReport(orderId);
      } catch (error) {
        alert(error?.message || "Unable to prepublish final report.");
      } finally {
        publishingFinalReports.delete(numericId);
        renderTable();
      }
      return;
    }

  });

  orderHistoryPageNode?.addEventListener("click", (event) => {
    const insideReportMenu = Boolean(event.target.closest("[data-report-menu-shell]"));
    const insideReviewMenu = Boolean(event.target.closest("[data-review-menu-shell]"));
    let didClose = false;
    if (!insideReportMenu) didClose = closeReportMenu() || didClose;
    if (!insideReviewMenu) didClose = closeReviewMenu() || didClose;
    if (didClose) renderTable();
  });

  orderHistoryPageNode?.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const didClose = closeReportMenu() || closeReviewMenu();
    if (didClose) renderTable();
  });

  tableNode.addEventListener("input", (event) => {
    const field = event.target.getAttribute("data-filter-field");
    if (!field) return;
    filters[field] = event.target.value;
    renderTable();
  });

  searchBtn?.addEventListener("click", renderTable);
  orderIdInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") renderTable();
  });
  fromDateInput?.addEventListener("change", renderTable);
  toDateInput?.addEventListener("change", renderTable);

  tabsNode?.addEventListener("click", (event) => {
    const tabBtn = event.target.closest("[data-tab]");
    if (!tabBtn) return;
    const nextTab = tabBtn.getAttribute("data-tab");
    if (!nextTab) return;
    activeTab = nextTab;
    openReportMenuOrderId = "";
    openReviewMenuOrderId = "";
    tabsNode.querySelectorAll(".history-tab").forEach((node) => {
      node.classList.toggle("active", node.getAttribute("data-tab") === activeTab);
    });

    const showUpload = activeTab === "upload-results";
    uploadPanelNode.classList.toggle("hidden", !showUpload);
    tableWrapNode.classList.toggle("hidden", showUpload);
    if (showUpload) {
      renderUploadPanel();
    } else {
      renderTable();
    }
  });

  previewModalNode?.addEventListener("click", async (event) => {
    const removeRowBtn = event.target.closest("[data-remove-validate-row]");
    if (removeRowBtn) {
      const orderId = removeRowBtn.getAttribute("data-order-id");
      const index = Number(removeRowBtn.getAttribute("data-remove-validate-row"));
      if (!orderId || Number.isNaN(index)) return;
      const removed = removeValidationDetailedRow(orderId, index);
      if (!removed) {
        alert("Unable to remove this validation row.");
      }
      return;
    }

    const addRowBtn = event.target.closest("[data-add-validate-row]");
    if (addRowBtn) {
      const orderId = addRowBtn.getAttribute("data-order-id");
      const type = addRowBtn.getAttribute("data-add-validate-row");
      if (!orderId || !type) return;
      const added = addValidationDetailedRow(orderId, type);
      if (!added) {
        alert("Unable to add a new validation row.");
      }
      return;
    }

    const undoBtn = event.target.closest("[data-undo-validate-row]");
    if (undoBtn) {
      const orderId = undoBtn.getAttribute("data-undo-validate-row");
      if (!orderId) return;
      const restored = undoValidationDetailedRow(orderId);
      if (!restored) {
        alert("Unable to restore the removed row.");
      }
      return;
    }

    const dismissUndoBtn = event.target.closest("[data-dismiss-validate-undo]");
    if (dismissUndoBtn) {
      const orderId = dismissUndoBtn.getAttribute("data-dismiss-validate-undo");
      if (!orderId) return;
      dismissValidationUndo(orderId);
      return;
    }

    const analyzeBtn = event.target.closest("[data-analyze-validate]");
    if (analyzeBtn) {
      const orderId = analyzeBtn.getAttribute("data-analyze-validate");
      if (!orderId) return;
      const analyzed = analyzeValidation(orderId);
      if (!analyzed) {
        alert("Unable to analyze validation values.");
      }
      return;
    }

    const saveBtn = event.target.closest("[data-save-validate]");
    if (saveBtn) {
      const orderId = saveBtn.getAttribute("data-save-validate");
      if (!orderId) return;
      const dialogMode = getValidationDialogMode(orderId);
      const saveState = getValidationSaveState(orderId);
      if (saveState.noteRequired) {
        updateValidationSaveState(orderId);
        previewModalNode.querySelector("[data-validate-note]")?.focus();
        alert("Please add a manual edit note before saving validation changes.");
        return;
      }
      const updated = await saveValidation(orderId);
      if (!updated) {
        alert("Unable to save validation values.");
        return;
      }
      renderTable();
      openValidate(orderId, null, { mode: dialogMode });
      return;
    }
    if (event.target.closest("[data-close-preview]") || event.target === previewModalNode) {
      closePreview();
    }
  });

  previewModalNode?.addEventListener("input", (event) => {
    if (!event.target.closest("[data-validate-field]") && !event.target.closest("[data-validate-note]")) return;
    const orderId = previewModalNode.getAttribute("data-validate-order-id");
    if (!orderId) return;
    updateValidationSaveState(orderId);
  });

  previewModalNode?.addEventListener("change", (event) => {
    if (!event.target.closest("[data-validate-field]") && !event.target.closest("[data-validate-note]")) return;
    const orderId = previewModalNode.getAttribute("data-validate-order-id");
    if (!orderId) return;
    updateValidationSaveState(orderId);
  });

  const showUpload = activeTab === "upload-results";
  uploadPanelNode.classList.toggle("hidden", !showUpload);
  tableWrapNode.classList.toggle("hidden", showUpload);
  if (showUpload) {
    renderUploadPanel();
  } else {
    renderTable();
  }
}

function deriveFacilityColumns(rows, entity = "accounts", options = {}) {
  const mode = options?.mode === "export" ? "export" : "table";
  const columnSet = new Set();
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (key === "_rowIndex") return;
      const value = row[key];
      if (value !== null && typeof value === "object") return;
      if (facilitySensitiveColumns.has(key)) return;
      columnSet.add(key);
    });
  });
  const allColumns = [...columnSet];
  const preferredColumns = Array.isArray(facilityTableColumnConfig[entity]) ? facilityTableColumnConfig[entity] : [];
  const orderedPreferred = preferredColumns.filter((key) => allColumns.includes(key));

  if (mode === "table") {
    return orderedPreferred.length ? orderedPreferred : allColumns.slice(0, 10);
  }

  const remainingColumns = allColumns.filter((key) => !orderedPreferred.includes(key));
  return [...orderedPreferred, ...remainingColumns];
}

function formatFacilityColumnLabel(key) {
  const normalized = String(key || "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  if (!normalized) return "-";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function isAccountDisabled(row) {
  const status = String(row?.status || row?.account_status || "").trim().toLowerCase();
  if (status.includes("disabled") || status.includes("inactive")) return true;

  const disabledRaw = row?.is_disabled ?? row?.disabled;
  if (disabledRaw !== undefined && disabledRaw !== null && String(disabledRaw).trim() !== "") {
    const normalized = String(disabledRaw).trim().toLowerCase();
    if (["1", "true", "yes", "y"].includes(normalized)) return true;
    if (["0", "false", "no", "n"].includes(normalized)) return false;
  }

  const activeRaw = row?.active ?? row?.is_active;
  if (activeRaw !== undefined && activeRaw !== null && String(activeRaw).trim() !== "") {
    const normalized = String(activeRaw).trim().toLowerCase();
    if (["0", "false", "no", "n"].includes(normalized)) return true;
  }

  return false;
}

function matchesAccountQuery(row, query) {
  if (!query) return true;
  const haystack = [
    row?.name,
    row?.contact,
    row?.account_code,
    row?.id,
    row?.email,
    row?.mailing_address,
    row?.city,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return haystack.includes(query);
}

function includesFilterValue(value, query) {
  if (!query) return true;
  return String(value || "").toLowerCase().includes(String(query || "").trim().toLowerCase());
}

function matchesAccountFilters(row, filters) {
  const active = filters || {};
  return (
    includesFilterValue(row?.name, active.name) &&
    includesFilterValue(row?.contact, active.contact) &&
    includesFilterValue(row?.account_code || row?.id, active.accountCode) &&
    includesFilterValue(row?.city, active.city) &&
    includesFilterValue(row?.email, active.email)
  );
}

function toCsvCell(value) {
  const raw = String(value === null || value === undefined ? "" : value);
  const escaped = raw.replaceAll('"', '""');
  if (/[",\n]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

function exportFacilityRows(entity, rows, columns) {
  if (!rows.length) {
    alert(`No ${entity} rows available to export.`);
    return;
  }

  const header = columns.length ? columns : deriveFacilityColumns(rows, entity, { mode: "export" });
  const lines = [
    header.map((col) => toCsvCell(formatFacilityColumnLabel(col))).join(","),
    ...rows.map((row) => header.map((col) => toCsvCell(row[col])).join(",")),
  ];
  const csv = `${lines.join("\n")}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${entity}-${getAppDateKey(new Date().toISOString()) || new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function loadFacilityData() {
  if (facilityDataLoaded) return facilityData;
  if (facilityDataPromise) return facilityDataPromise;

  facilityDataLoading = true;
  facilityDataPromise = (async () => {
    try {
      const payload = await requestJson("/api/facility/data");
      facilityData = {
        accounts: Array.isArray(payload.accounts) ? payload.accounts : [],
        providers: Array.isArray(payload.providers) ? payload.providers : [],
      };
    } catch {
      facilityData = {
        accounts: [],
        providers: [],
      };
    } finally {
      facilityDataLoaded = true;
      facilityDataLoading = false;
      facilityDataPromise = null;
    }
    return facilityData;
  })();

  return facilityDataPromise;
}

function closeCreateAccountModal() {
  const existing = document.getElementById("facility-create-account-modal");
  if (existing) existing.remove();
}

function closeCreateProviderModal() {
  const existing = document.getElementById("facility-create-provider-modal");
  if (existing) existing.remove();
}

function closeFacilityModals() {
  closeCreateAccountModal();
  closeCreateProviderModal();
  document.body.classList.remove("modal-open");
}

function buildPortalAccessCards(activeValue, entityLabel) {
  const subject = entityLabel || "Accounts";
  return [
    {
      value: "report_view",
      title: "Report View Access",
      description: `${subject} can access reports for their patients.`,
    },
    {
      value: "report_view_order",
      title: "Report View + Order Access",
      description: `${subject} can place orders and access reports for their patients.`,
    },
    {
      value: "no_login",
      title: "No Login",
      description: `No portal access for this ${String(entityLabel || "account").toLowerCase().replace(/s$/, "")}.`,
    },
  ]
    .map((item) => {
      const checked = item.value === activeValue ? "checked" : "";
      const activeClass = item.value === activeValue ? "active" : "";
      return `
        <label class="facility-access-card ${activeClass}">
          <input type="radio" name="accessType" value="${item.value}" ${checked}>
          <h4>${item.title}</h4>
          <p>${item.description}</p>
        </label>
      `;
    })
    .join("");
}

function matchesProviderQuery(row, query) {
  if (!query) return true;
  const haystack = [
    row?.validator_name,
    row?.provider_name,
    row?.display_name,
    row?.contact_no,
    row?.email_id,
    row?.speciality,
    row?.state,
    row?.account,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return haystack.includes(query);
}

function matchesProviderFilters(row, filters) {
  const active = filters || {};
  return (
    includesFilterValue(row?.validator_name || row?.provider_name || row?.display_name, active.name) &&
    includesFilterValue(row?.contact_no, active.contact) &&
    includesFilterValue(row?.speciality, active.specialty) &&
    includesFilterValue(row?.state, active.state) &&
    includesFilterValue(row?.email_id, active.email)
  );
}

function isTruthyLike(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function assignFieldValue(form, name, value) {
  const field = form.querySelector(`[name="${name}"]`);
  if (!field) return;
  field.value = value === undefined || value === null ? "" : String(value);
}

function assignChecked(form, name, value) {
  const field = form.querySelector(`input[name="${name}"]`);
  if (!field) return;
  field.checked = isTruthyLike(value);
}

function normalizeNpiLookupValue(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

async function fetchProviderDetailsByNpi(npi) {
  const normalizedNpi = normalizeNpiLookupValue(npi);
  if (normalizedNpi.length !== 10) {
    throw new Error("Provider NPI must be 10 digits.");
  }
  const payload = await requestJson(
    `/api/facility/providers/lookup?npi=${encodeURIComponent(normalizedNpi)}`
  );
  return payload?.provider && typeof payload.provider === "object" ? payload.provider : {};
}

function applyProviderLookupToProviderForm(form, provider) {
  if (!form || !provider || typeof provider !== "object") return;

  const providerName = String(provider.providerName || "").trim();
  const designation = String(provider.designation || "").trim();
  const displayName = String(provider.displayName || "").trim();
  const normalizedNpi = normalizeNpiLookupValue(provider.npi);
  const displayNameField = form.querySelector('[name="displayName"]');

  if (normalizedNpi) {
    assignFieldValue(form, "providerNpiSearch", normalizedNpi);
    assignFieldValue(form, "npi", normalizedNpi);
  }
  if (designation) assignFieldValue(form, "designation", designation);
  if (providerName) {
    assignFieldValue(form, "providerName", providerName);
    form
      .querySelector('input[name="providerName"]')
        ?.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (displayName) {
    assignFieldValue(form, "displayName", displayName);
    if (displayNameField instanceof HTMLElement) {
      displayNameField.dataset.autoValue = displayName;
    }
  }
  if (provider.contactNo) assignFieldValue(form, "contactNo", provider.contactNo);
  if (provider.credential) assignFieldValue(form, "credential", provider.credential);
  if (provider.speciality) assignFieldValue(form, "speciality", provider.speciality);
  if (provider.mailingAddress) assignFieldValue(form, "mailingAddress", provider.mailingAddress);
  if (provider.city) assignFieldValue(form, "city", provider.city);
  if (provider.state) assignFieldValue(form, "state", provider.state);
  if (provider.zipcode) assignFieldValue(form, "zipcode", provider.zipcode);
  if (provider.faxNumber) assignFieldValue(form, "faxNumber", provider.faxNumber);
  if (form instanceof HTMLElement) {
    if (provider.source) {
      form.dataset.lookupSource = String(provider.source);
    } else {
      delete form.dataset.lookupSource;
    }
  }
}

function resolveAccountIdentifier(account, index) {
  const rawId = String(account?.id || "").trim();
  if (rawId) return rawId;
  return `idx-${index}`;
}

function resolveProviderIdentifier(provider, index) {
  const rawId = String(provider?.provider_id || "").trim();
  if (rawId) return rawId;
  return `idx-${index}`;
}

function resolveAccountIndexByIdentifier(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return -1;
  if (raw.startsWith("idx-")) {
    const index = Number(raw.slice(4));
    return Number.isInteger(index) && index >= 0 && index < facilityData.accounts.length ? index : -1;
  }
  return facilityData.accounts.findIndex((row) => String(row?.id || "").trim() === raw);
}

function resolveProviderIndexByIdentifier(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return -1;
  if (raw.startsWith("idx-")) {
    const index = Number(raw.slice(4));
    return Number.isInteger(index) && index >= 0 && index < facilityData.providers.length ? index : -1;
  }
  return facilityData.providers.findIndex((row) => String(row?.provider_id || "").trim() === raw);
}

function formatFacilityGridValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function getFacilityGridColumnWidth(columnKey) {
  const widthMap = {
    srno: 92,
    sr_no: 92,
    name: 220,
    validator_name: 220,
    provider_name: 220,
    display_name: 220,
    id: 120,
    provider_id: 120,
    contact: 150,
    contact_no: 150,
    account_code: 140,
    account: 140,
    email: 220,
    email_id: 220,
    credit_limit: 130,
    current_due: 130,
    credit_days_remaining: 170,
    city: 160,
    state: 110,
    status: 120,
  };
  return widthMap[columnKey] || 150;
}

class FacilityGridHeader {
  init(params) {
    this.params = params;
    this.eGui = document.createElement("div");
    this.eGui.className = "th-wrap facility-grid-header";

    if (!params.enableSorting && !params.enableMenu) {
      this.eGui.innerHTML = `<span class="facility-grid-header-label">${escapeHtml(params.displayName || "")}</span>`;
      return;
    }

    this.sortButton = document.createElement("button");
    this.sortButton.type = "button";
    this.sortButton.className = "sort-btn facility-grid-sort-btn";
    this.sortButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (this.params.enableSorting) {
        this.params.progressSort(event.shiftKey);
      }
    });

    if (params.enableMenu || params.enableFilterButton) {
      this.menuButton = document.createElement("button");
      this.menuButton.type = "button";
      this.menuButton.className = "filter-toggle facility-grid-menu-btn";
      this.menuButton.setAttribute("aria-label", `Open menu for ${params.displayName}`);
      this.menuButton.textContent = "▼";
      this.menuButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (this.params.enableMenu) {
          this.params.showColumnMenu(this.menuButton);
        } else if (this.params.enableFilterButton) {
          this.params.showFilter(this.menuButton);
        }
      });
      this.eGui.append(this.sortButton, this.menuButton);
    } else {
      this.menuButton = null;
      this.eGui.append(this.sortButton);
    }
    this.updateState = this.updateState.bind(this);
    this.params.api.addEventListener("sortChanged", this.updateState);
    this.params.api.addEventListener("filterChanged", this.updateState);
    this.updateState();
  }

  updateState() {
    if (!this.sortButton) return;
    const sort = this.params.column.getSort();
    const sortIcon = sort === "asc" ? "↑" : sort === "desc" ? "↓" : "↕";
    this.sortButton.textContent = `${this.params.displayName} ${sortIcon}`;
    if (this.menuButton) {
      this.menuButton.classList.toggle("active", Boolean(this.params.column.isFilterActive()));
    }
  }

  getGui() {
    return this.eGui;
  }

  refresh(params) {
    this.params = params;
    this.updateState();
    return true;
  }

  destroy() {
    if (this.params?.api && this.updateState) {
      this.params.api.removeEventListener("sortChanged", this.updateState);
      this.params.api.removeEventListener("filterChanged", this.updateState);
    }
  }
}

function buildFacilityGridColumnDefs(columns, entity) {
  return [
    ...columns.map((columnKey, index) => ({
      field: columnKey,
      headerName: formatFacilityColumnLabel(columnKey),
      headerComponent: FacilityGridHeader,
      minWidth: getFacilityGridColumnWidth(columnKey),
      filter: "agTextColumnFilter",
      wrapText: true,
      autoHeight: true,
      sort: index === 0 ? "asc" : null,
      unSortIcon: true,
      valueFormatter: (params) => formatFacilityGridValue(params.value),
      tooltipValueGetter: (params) => formatFacilityGridValue(params.value),
    })),
    {
      headerName: "Actions",
      field: "__actions",
      colId: "__actions",
      pinned: "right",
      width: 170,
      minWidth: 170,
      maxWidth: 170,
      headerComponent: FacilityGridHeader,
      sortable: false,
      filter: false,
      suppressMovable: true,
      suppressNavigable: true,
      lockPinned: true,
      cellClass: "facility-grid-actions-cell",
      cellRenderer: (params) => buildFacilityRowActionsMarkup(entity, params.data.identifier || ""),
    },
  ];
}

function buildFacilityRowActionsMarkup(entity, identifier = "") {
  return `
    <div class="facility-row-actions">
      <button type="button" class="table-action-btn" data-facility-row-action="edit" data-facility-entity="${escapeHtml(entity)}" data-facility-id="${escapeHtml(identifier)}">Edit</button>
      <button type="button" class="table-action-btn" data-facility-row-action="login-status" data-facility-entity="${escapeHtml(entity)}" data-facility-id="${escapeHtml(identifier)}">Login</button>
    </div>
  `;
}

function mountFacilityGrid(container, rows, columns, entity) {
  if (!container || !window.agGrid || typeof window.agGrid.createGrid !== "function") {
    return null;
  }

  const rowData = rows.map((entry) => ({
    ...entry.row,
    identifier: entry.identifier,
  }));

  return window.agGrid.createGrid(container, {
    rowData,
    columnDefs: buildFacilityGridColumnDefs(columns, entity),
    defaultColDef: {
      sortable: true,
      resizable: true,
      filter: true,
      floatingFilter: false,
      suppressHeaderMenuButton: false,
      suppressHeaderFilterButton: true,
    },
    pagination: true,
    paginationPageSize: 25,
    paginationPageSizeSelector: [10, 25, 50, 100],
    animateRows: true,
    domLayout: "autoHeight",
    tooltipShowDelay: 250,
    suppressRowClickSelection: true,
    suppressCellFocus: true,
    headerHeight: 62,
    rowHeight: 66,
  });
}

function buildFacilityTableMarkup(entries, columns, entity) {
  const headerCells = columns
    .map((columnKey) => `<th>${escapeHtml(formatFacilityColumnLabel(columnKey))}</th>`)
    .join("");
  const bodyRows = entries
    .map((entry) => {
      const dataCells = columns
        .map((columnKey) => `<td>${escapeHtml(formatFacilityGridValue(entry.row?.[columnKey]))}</td>`)
        .join("");
      return `
        <tr>
          ${dataCells}
          <td class="facility-actions-cell">${buildFacilityRowActionsMarkup(entity, entry.identifier)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="order-history-table facility-table">
      <thead>
        <tr>
          ${headerCells}
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

function parseProviderDisplayName(rawName) {
  const full = String(rawName || "").trim();
  if (!full) return { designation: "", providerName: "" };
  const match = full.match(/^(Dr\.|Mr\.|Ms\.|Mrs\.)\s+(.+)$/i);
  if (!match) return { designation: "", providerName: full };
  const normalizedDesignation = ["Dr.", "Mr.", "Ms.", "Mrs."].find(
    (candidate) => candidate.toLowerCase() === String(match[1]).toLowerCase()
  );
  return {
    designation: normalizedDesignation || "",
    providerName: String(match[2] || "").trim(),
  };
}

function generateStrongPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  let generated = "";
  for (let i = 0; i < length; i += 1) {
    generated += chars[Math.floor(Math.random() * chars.length)];
  }
  return generated;
}

function openCreateAccountModal(existingRecord = null, identifier = "", options = {}) {
  closeFacilityModals();
  const focusAccess = Boolean(options?.focusAccess);
  facilityModalSection = focusAccess ? "access" : "basic";
  const existingAccount = existingRecord && typeof existingRecord === "object" ? existingRecord : null;
  const editMode = Boolean(existingAccount);
  const editIdentifier = String(identifier || existingAccount?.id || "").trim();

  const modal = document.createElement("div");
  modal.id = "facility-create-account-modal";
  modal.className = "facility-modal-backdrop";
  modal.innerHTML = `
    <div class="facility-modal-shell" role="dialog" aria-modal="true" aria-labelledby="facility-modal-title">
      <div class="facility-modal-head">
        <h3 id="facility-modal-title">${editMode ? "Edit Account" : "Create Account"}</h3>
        <button type="button" class="facility-modal-close" data-modal-close aria-label="Close">×</button>
      </div>
      <div class="facility-modal-main">
        <aside class="facility-modal-nav">
          ${facilityModalSections
            .map(
              (section) => `
                <button type="button" class="facility-modal-nav-btn ${section.key === facilityModalSection ? "active" : ""}" data-modal-nav="${section.key}">
                  ${section.label}
                </button>
              `
            )
            .join("")}
        </aside>
        <form id="facility-create-account-form" class="facility-modal-form" novalidate>
          <section class="facility-modal-section" data-modal-section="basic">
            <h4>Basic Information</h4>
            <div class="facility-modal-grid two">
              <label>
                <span>NPI Search</span>
                <div class="facility-inline-input">
                  <input name="npiSearch" placeholder="Search using 10 digit NPI number">
                  <button type="button" class="btn-primary mini" data-npi-fetch>Fetch Information</button>
                </div>
              </label>
              <label><span>Account Name *</span><input name="accountName" required placeholder="Account Name"></label>
              <label><span>Contact</span><input name="contact" placeholder="Enter Contact Number"></label>
              <label><span>Extension</span><input name="extension" placeholder="Extension"></label>
              <label><span>NPI Number</span><input name="npiNumber" placeholder="NPI Number"></label>
              <label><span>Fax Number</span><input name="faxNumber" placeholder="Fax Number"></label>
              <label><span>Email</span><input name="email" type="email" placeholder="Email"></label>
              <label><span>Marketing Person</span><input name="marketingPerson" placeholder="Marketing Person"></label>
              <label class="full"><span>Mailing Address</span><input name="mailingAddress" placeholder="Account Mailing Address"></label>
              <label><span>City</span><input name="city" placeholder="City"></label>
              <label><span>State</span><input name="state" placeholder="State"></label>
              <label><span>Zipcode</span><input name="zipcode" placeholder="Zipcode"></label>
              <label><span>Area</span><input name="area" placeholder="Area"></label>
              <label><span>Account Code</span><input name="accountCode" placeholder="Account Code"></label>
              <label><span>Notes</span><input name="notes" placeholder="Notes"></label>
            </div>
          </section>

          <section class="facility-modal-section hidden" data-modal-section="payment">
            <h4>Payment Configurations</h4>
            <p class="subtle">How would this account pay you?</p>
            <div class="facility-payment-modes">
              <label><input type="radio" name="paymentPlan" value="walkin" checked> Walkin</label>
              <label><input type="radio" name="paymentPlan" value="flexible_prepaid"> Flexible Prepaid</label>
              <label><input type="radio" name="paymentPlan" value="postpaid"> PostPaid</label>
              <label><input type="radio" name="paymentPlan" value="prepaid"> PrePaid</label>
            </div>
            <div class="facility-modal-grid two">
              <label><span>Revenue Target</span><input name="revenueTarget" type="number" min="0" value="0"></label>
              <label>
                <span>Payment Mode</span>
                <select name="paymentMode">
                  <option value="CASH">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Online">Online</option>
                  <option value="Invoice">Invoice</option>
                </select>
              </label>
              <label><span>Credit Limit</span><input name="creditLimit" type="number" min="0" value="0"></label>
              <label><span>Credit Days</span><input name="creditDays" type="number" min="0" value="0"></label>
              <label class="full"><span>Billing Sources</span><input name="billingSources" placeholder="Select source options"></label>
              <label class="full"><span>Default Source</span><input name="defaultSource" placeholder="None (Default)"></label>
            </div>
          </section>

          <section class="facility-modal-section hidden" data-modal-section="settings">
            <h4>Account Settings</h4>
            <div class="facility-setting-list">
              <label><input type="checkbox" name="recordPatientContact"> Always record patient contact details</label>
              <label><input type="checkbox" name="autoDismissedEmail"> Auto sample dismissed email</label>
              <label><input type="checkbox" name="autoReportEmail"> Auto report ready email</label>
              <label><input type="checkbox" name="autoReportWhatsapp"> Auto report ready WhatsApp</label>
              <label><input type="checkbox" name="autoReportFax"> Auto report ready Fax</label>
              <label><input type="checkbox" name="showOnlyPaidReports"> Show only paid reports</label>
              <label><input type="checkbox" name="showSecondaryUnits"> Show secondary units</label>
              <label><input type="checkbox" name="showHeaderFooter"> Show header and footer</label>
            </div>
          </section>

          <section class="facility-modal-section hidden" data-modal-section="access">
            <h4>Login & Access Settings</h4>
            <p class="subtle">Choose how this account can access the portal.</p>
            <div class="facility-access-cards">
              ${buildPortalAccessCards("report_view", "Accounts")}
            </div>
            <div id="facility-login-credentials" class="facility-modal-grid two">
              <label><span>Username *</span><input name="portalUsername" placeholder="Username"></label>
              <label>
                <span>Password *</span>
                <div class="facility-inline-input">
                  <input name="portalPassword" type="password" placeholder="Password">
                  <button type="button" class="btn-ghost mini" data-generate-password>Generate Password</button>
                </div>
              </label>
              <label>
                <span>Default Language</span>
                <select name="defaultLanguage">
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                </select>
              </label>
              <label><span>Point of Contact</span><input name="portalContact" placeholder="Enter Contact Number"></label>
            </div>
            <p class="subtle">Leave password blank during edit to keep the current password.</p>
            <div class="facility-setting-list">
              <label><input type="checkbox" name="linkExistingAccount"> Link with existing account</label>
              <label><input type="checkbox" name="enableWhatsappCommunication"> Enable WhatsApp Communication</label>
              <label><input type="checkbox" name="privOperationRelated"> Operation related access</label>
              <label><input type="checkbox" name="privFinanceRelated"> Finance related access</label>
              <label><input type="checkbox" name="privPatientSearch"> Patient Search access</label>
              <label><input type="checkbox" name="privAdvancedSearch"> Advanced Search access</label>
            </div>
            <div class="facility-login-status" id="facility-account-login-status"></div>
            <div class="facility-modal-login-actions">
              <button type="button" class="btn-primary mini" data-update-login-config>Update Login Configuration</button>
            </div>
          </section>

          <section class="facility-modal-section hidden" data-modal-section="org">
            <h4>Org Hierarchy</h4>
            <div class="facility-modal-grid two">
              <label><span>Add Sub Accounts</span><input name="subAccounts" placeholder="Comma-separated sub accounts"></label>
              <label><span>Choose Main Account</span><input name="mainAccount" placeholder="Main account"></label>
            </div>
          </section>

          <p id="facility-modal-error" class="error" aria-live="polite"></p>
          <div class="facility-modal-footer">
            <button type="button" class="btn-ghost" data-modal-close>Close</button>
            <button type="submit" class="btn-primary">${editMode ? "Update Account" : "Add Account"}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  const form = modal.querySelector("#facility-create-account-form");
  const errorNode = modal.querySelector("#facility-modal-error");
  const accountNameInput = form.querySelector('input[name="accountName"]');
  const usernameInput = form.querySelector('input[name="portalUsername"]');
  const passwordInput = form.querySelector('input[name="portalPassword"]');
  const credentialsWrap = modal.querySelector("#facility-login-credentials");
  const loginStatusNode = modal.querySelector("#facility-account-login-status");
  const navButtons = Array.from(modal.querySelectorAll("[data-modal-nav]"));
  const sectionNodes = Array.from(modal.querySelectorAll("[data-modal-section]"));

  if (editMode) {
    const basicInfo =
      existingAccount?.basic_information && typeof existingAccount.basic_information === "object"
        ? existingAccount.basic_information
        : {};
    const paymentConfigurations =
      existingAccount?.payment_configurations && typeof existingAccount.payment_configurations === "object"
        ? existingAccount.payment_configurations
        : {};
    const accountSettings =
      existingAccount?.account_settings && typeof existingAccount.account_settings === "object"
        ? existingAccount.account_settings
        : {};
    const loginAccess =
      existingAccount?.login_access && typeof existingAccount.login_access === "object"
        ? existingAccount.login_access
        : {};
    const portal = existingAccount?.portal && typeof existingAccount.portal === "object" ? existingAccount.portal : {};
    const privileges =
      loginAccess.privileges && typeof loginAccess.privileges === "object"
        ? loginAccess.privileges
        : portal.privileges && typeof portal.privileges === "object"
        ? portal.privileges
        : {};
    const orgHierarchy =
      existingAccount?.org_hierarchy && typeof existingAccount.org_hierarchy === "object"
        ? existingAccount.org_hierarchy
        : {};
    const accessType =
      loginAccess.accessType ||
      existingAccount.portal_access ||
      (String(existingAccount.portal_enabled || "").toLowerCase() === "yes" ? "report_view" : "no_login");

    assignFieldValue(form, "npiSearch", basicInfo.npiNumber);
    assignFieldValue(form, "accountName", basicInfo.accountName || existingAccount.name);
    assignFieldValue(form, "contact", basicInfo.contact || existingAccount.contact);
    assignFieldValue(form, "extension", basicInfo.extension);
    assignFieldValue(form, "npiNumber", basicInfo.npiNumber);
    assignFieldValue(form, "faxNumber", basicInfo.faxNumber);
    assignFieldValue(form, "email", basicInfo.email || existingAccount.email);
    assignFieldValue(form, "marketingPerson", basicInfo.marketingPerson || existingAccount.marketing_person);
    assignFieldValue(form, "mailingAddress", basicInfo.mailingAddress || existingAccount.mailing_address);
    assignFieldValue(form, "city", basicInfo.city || existingAccount.city);
    assignFieldValue(form, "state", basicInfo.state || existingAccount.state);
    assignFieldValue(form, "zipcode", basicInfo.zipcode || existingAccount.zipcode);
    assignFieldValue(form, "area", basicInfo.area || existingAccount.area);
    assignFieldValue(form, "accountCode", basicInfo.accountCode || existingAccount.account_code);
    assignFieldValue(form, "notes", basicInfo.notes || existingAccount.notes);

    if (paymentConfigurations.paymentPlan) {
      const paymentPlanInput = form.querySelector(`input[name="paymentPlan"][value="${paymentConfigurations.paymentPlan}"]`);
      if (paymentPlanInput) paymentPlanInput.checked = true;
    }
    assignFieldValue(form, "revenueTarget", paymentConfigurations.revenueTarget);
    assignFieldValue(form, "paymentMode", paymentConfigurations.paymentMode || existingAccount.payment_mode);
    assignFieldValue(form, "creditLimit", paymentConfigurations.creditLimit || existingAccount.credit_limit);
    assignFieldValue(form, "creditDays", paymentConfigurations.creditDays || existingAccount.credit_days_remaining);
    assignFieldValue(form, "billingSources", paymentConfigurations.billingSources);
    assignFieldValue(form, "defaultSource", paymentConfigurations.defaultSource);

    assignChecked(form, "recordPatientContact", accountSettings.recordPatientContact);
    assignChecked(form, "autoDismissedEmail", accountSettings.autoDismissedEmail);
    assignChecked(form, "autoReportEmail", accountSettings.autoReportEmail);
    assignChecked(form, "autoReportWhatsapp", accountSettings.autoReportWhatsapp);
    assignChecked(form, "autoReportFax", accountSettings.autoReportFax);
    assignChecked(form, "showOnlyPaidReports", accountSettings.showOnlyPaidReports);
    assignChecked(form, "showSecondaryUnits", accountSettings.showSecondaryUnits);
    assignChecked(form, "showHeaderFooter", accountSettings.showHeaderFooter);

    const accessInput = form.querySelector(`input[name="accessType"][value="${accessType}"]`);
    if (accessInput) accessInput.checked = true;
    assignFieldValue(form, "portalUsername", existingAccount.portal_username || portal.username);
    assignFieldValue(form, "portalPassword", "");
    assignFieldValue(
      form,
      "defaultLanguage",
      loginAccess.defaultLanguage || existingAccount.portal_default_language || portal.defaultLanguage || "English"
    );
    assignFieldValue(form, "portalContact", loginAccess.portalContact || portal.portalContact);
    assignChecked(form, "linkExistingAccount", loginAccess.linkExistingAccount ?? portal.linkExistingAccount);
    assignChecked(form, "enableWhatsappCommunication", loginAccess.whatsappEnabled ?? portal.whatsappEnabled);
    assignChecked(form, "privOperationRelated", privileges.operationRelated);
    assignChecked(form, "privFinanceRelated", privileges.financeRelated);
    assignChecked(form, "privPatientSearch", privileges.patientSearch);
    assignChecked(form, "privAdvancedSearch", privileges.advancedSearch);

    assignFieldValue(form, "subAccounts", orgHierarchy.subAccounts);
    assignFieldValue(form, "mainAccount", orgHierarchy.mainAccount);
  }

  function syncSectionVisibility() {
    navButtons.forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-modal-nav") === facilityModalSection);
    });
    sectionNodes.forEach((node) => {
      node.classList.toggle("hidden", node.getAttribute("data-modal-section") !== facilityModalSection);
    });
  }

  function syncAccessCards() {
    const accessType = form.querySelector('input[name="accessType"]:checked')?.value || "report_view";
    modal.querySelectorAll(".facility-access-card").forEach((card) => {
      const value = card.querySelector('input[name="accessType"]')?.value;
      card.classList.toggle("active", value === accessType);
    });
    const showCredentials = accessType !== "no_login";
    credentialsWrap.classList.toggle("hidden", !showCredentials);
    renderLoginStatus();
  }

  function renderLoginStatus() {
    if (!loginStatusNode) return;
    const accessType = form.querySelector('input[name="accessType"]:checked')?.value || "no_login";
    const portalEnabled = accessType !== "no_login";
    const username = String(usernameInput?.value || "").trim();
    const hasExistingPassword = recordHasConfiguredPortalPassword(existingAccount);
    const hasNewPassword = Boolean(String(passwordInput?.value || "").trim());
    const hasPassword = portalEnabled ? hasExistingPassword || hasNewPassword : false;
    const loginReady = portalEnabled && Boolean(username) && hasPassword;

    loginStatusNode.innerHTML = `
      <p><strong>Login Status:</strong> ${portalEnabled ? "Enabled" : "Disabled"}</p>
      <p><strong>Username:</strong> ${username ? "Configured" : "Missing"}</p>
      <p><strong>Password:</strong> ${hasPassword ? "Configured" : "Missing"}</p>
      <p><strong>Client Portal Ready:</strong> <span class="${loginReady ? "status-ready" : "status-not-ready"}">${loginReady ? "Yes" : "No"}</span></p>
    `;
  }

  syncSectionVisibility();
  syncAccessCards();
  renderLoginStatus();

  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-modal-close]")) {
      closeFacilityModals();
      return;
    }
    const navBtn = event.target.closest("[data-modal-nav]");
    if (navBtn) {
      facilityModalSection = navBtn.getAttribute("data-modal-nav") || "basic";
      syncSectionVisibility();
      return;
    }
    if (event.target.closest("[data-npi-fetch]")) {
      const npiField = form.querySelector('input[name="npiNumber"]');
      const searchField = form.querySelector('input[name="npiSearch"]');
      if (npiField && searchField && !npiField.value.trim()) npiField.value = searchField.value.trim();
      return;
    }
    if (event.target.closest("[data-generate-password]")) {
      if (passwordInput) passwordInput.value = generateStrongPassword(12);
      renderLoginStatus();
      return;
    }
    if (event.target.closest("[data-update-login-config]")) {
      facilityModalSection = "access";
      syncSectionVisibility();
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
    }
  });

  form.addEventListener("change", (event) => {
    if (event.target.matches('input[name="accessType"]')) {
      syncAccessCards();
    }
    if (event.target.matches('input[name="portalUsername"], input[name="portalPassword"]')) {
      renderLoginStatus();
    }
  });

  usernameInput?.addEventListener("input", renderLoginStatus);
  passwordInput?.addEventListener("input", renderLoginStatus);

  accountNameInput?.addEventListener("input", () => {
    if (!usernameInput) return;
    if (usernameInput.value.trim()) return;
    usernameInput.value = accountNameInput.value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".");
    renderLoginStatus();
  });

  function showModalError(message, sectionKey) {
    errorNode.textContent = message;
    if (sectionKey) {
      facilityModalSection = sectionKey;
      syncSectionVisibility();
    }
    errorNode.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!csrfToken) await fetchCsrfToken().catch(() => {});
    errorNode.textContent = "";

    const data = Object.fromEntries(new FormData(form).entries());
    const accessType = String(data.accessType || "report_view");
    const portalEnabled = accessType !== "no_login";
    const hasExistingPortalHash = recordHasConfiguredPortalPassword(existingAccount);
    const nextPortalPassword = String(data.portalPassword || "");

    if (!String(data.accountName || "").trim()) {
      showModalError("Account Name is required.", "basic");
      return;
    }
    if (portalEnabled) {
      if (!String(data.portalUsername || "").trim()) {
        showModalError("Portal username is required for selected access.", "access");
        return;
      }
      if ((!editMode || !hasExistingPortalHash) && nextPortalPassword.length < 8) {
        showModalError("Portal password must be at least 8 characters.", "access");
        return;
      }
      if ((editMode && hasExistingPortalHash && nextPortalPassword) && nextPortalPassword.length < 8) {
        showModalError("Portal password must be at least 8 characters.", "access");
        return;
      }
    }

    const payload = {
      basicInfo: {
        accountName: data.accountName,
        contact: data.contact,
        extension: data.extension,
        npiNumber: data.npiNumber,
        faxNumber: data.faxNumber,
        email: data.email,
        marketingPerson: data.marketingPerson,
        mailingAddress: data.mailingAddress,
        city: data.city,
        state: data.state,
        zipcode: data.zipcode,
        area: data.area,
        accountCode: data.accountCode,
        notes: data.notes,
      },
      paymentConfigurations: {
        paymentPlan: data.paymentPlan,
        revenueTarget: data.revenueTarget,
        paymentMode: data.paymentMode,
        creditLimit: data.creditLimit,
        creditDays: data.creditDays,
        billingSources: data.billingSources,
        defaultSource: data.defaultSource,
      },
      accountSettings: {
        recordPatientContact: Boolean(form.querySelector('input[name="recordPatientContact"]')?.checked),
        autoDismissedEmail: Boolean(form.querySelector('input[name="autoDismissedEmail"]')?.checked),
        autoReportEmail: Boolean(form.querySelector('input[name="autoReportEmail"]')?.checked),
        autoReportWhatsapp: Boolean(form.querySelector('input[name="autoReportWhatsapp"]')?.checked),
        autoReportFax: Boolean(form.querySelector('input[name="autoReportFax"]')?.checked),
        showOnlyPaidReports: Boolean(form.querySelector('input[name="showOnlyPaidReports"]')?.checked),
        showSecondaryUnits: Boolean(form.querySelector('input[name="showSecondaryUnits"]')?.checked),
        showHeaderFooter: Boolean(form.querySelector('input[name="showHeaderFooter"]')?.checked),
      },
      loginAccess: {
        accessType,
        username: data.portalUsername,
        password: data.portalPassword,
        defaultLanguage: data.defaultLanguage,
        portalContact: data.portalContact,
        linkExistingAccount: Boolean(form.querySelector('input[name="linkExistingAccount"]')?.checked),
        whatsappEnabled: Boolean(form.querySelector('input[name="enableWhatsappCommunication"]')?.checked),
        privileges: {
          operationRelated: Boolean(form.querySelector('input[name="privOperationRelated"]')?.checked),
          financeRelated: Boolean(form.querySelector('input[name="privFinanceRelated"]')?.checked),
          patientSearch: Boolean(form.querySelector('input[name="privPatientSearch"]')?.checked),
          advancedSearch: Boolean(form.querySelector('input[name="privAdvancedSearch"]')?.checked),
        },
      },
      orgHierarchy: {
        subAccounts: data.subAccounts,
        mainAccount: data.mainAccount,
      },
    };

    const submitButton = form.querySelector('button[type="submit"]');
    const submitLabel = submitButton ? submitButton.textContent : "";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = editMode ? "Updating..." : "Creating...";
    }
    try {
      const endpoint = editMode ? `/api/facility/accounts/${encodeURIComponent(editIdentifier)}` : "/api/facility/accounts";
      const result = await requestJson(endpoint, {
        method: editMode ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify(payload),
      });

      if (result?.account) {
        if (editMode) {
          const accountIndex = resolveAccountIndexByIdentifier(editIdentifier);
          if (accountIndex >= 0) {
            facilityData.accounts[accountIndex] = result.account;
          } else {
            facilityData.accounts = [result.account, ...(facilityData.accounts || [])];
          }
        } else {
          facilityData.accounts = [result.account, ...(facilityData.accounts || [])];
        }
        facilityDataLoaded = true;
      } else {
        facilityDataLoaded = false;
      }
      facilityTab = "accounts";
      facilityAccountsQuery = "";
      facilityAccountsDisabledOnly = false;
      closeFacilityModals();
      if (currentView === "facility") renderFacility();
    } catch (error) {
      showModalError(error.message || (editMode ? "Unable to update account." : "Unable to create account."));
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitLabel;
      }
    }
  });
}

function openCreateProviderModal(existingRecord = null, identifier = "", options = {}) {
  closeFacilityModals();
  const focusAccess = Boolean(options?.focusAccess);
  facilityProviderModalSection = focusAccess ? "provider-access" : "provider-info";
  const existingProvider = existingRecord && typeof existingRecord === "object" ? existingRecord : null;
  const editMode = Boolean(existingProvider);
  const editIdentifier = String(identifier || existingProvider?.provider_id || "").trim();

  const modal = document.createElement("div");
  modal.id = "facility-create-provider-modal";
  modal.className = "facility-modal-backdrop";
  modal.innerHTML = `
    <div class="facility-modal-shell" role="dialog" aria-modal="true" aria-labelledby="facility-provider-modal-title">
      <div class="facility-modal-head">
        <h3 id="facility-provider-modal-title">${editMode ? "Edit Provider" : "Create Provider"}</h3>
        <button type="button" class="facility-modal-close" data-provider-modal-close aria-label="Close">×</button>
      </div>
      <div class="facility-modal-main">
        <aside class="facility-modal-nav">
          ${facilityProviderModalSections
            .map(
              (section) => `
                <button type="button" class="facility-modal-nav-btn ${section.key === facilityProviderModalSection ? "active" : ""}" data-provider-modal-nav="${section.key}">
                  ${section.label}
                </button>
              `
            )
            .join("")}
        </aside>
        <form id="facility-create-provider-form" class="facility-modal-form" novalidate>
          <section class="facility-modal-section" data-provider-modal-section="provider-info">
            <h4>Provider Information</h4>
            <div class="facility-modal-grid two">
              <label>
                <span>NPI Search</span>
                <div class="facility-inline-input">
                  <input name="providerNpiSearch" placeholder="Search using 10 digit NPI number">
                  <button type="button" class="btn-primary mini" data-provider-npi-fetch>Fetch Information</button>
                </div>
              </label>
              <label>
                <span>Provider Name *</span>
                <div class="facility-inline-input">
                  <select name="designation">
                    <option value="Dr.">Dr.</option>
                    <option value="Mr.">Mr.</option>
                    <option value="Ms.">Ms.</option>
                    <option value="Mrs.">Mrs.</option>
                    <option value="">No Prefix</option>
                  </select>
                  <input name="providerName" required placeholder="Provider Name">
                </div>
              </label>
              <label><span>Display Name</span><input name="displayName" placeholder="Display Name"></label>
              <label><span>Contact Number</span><input name="contactNo" placeholder="Enter Contact Number"></label>
              <label><span>Extension</span><input name="extension" placeholder="Extension"></label>
              <label>
                <span>DOB</span>
                <div class="facility-inline-input facility-triple-inline">
                  <select name="dobMonth">
                    <option value="">Month</option>
                    ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}
                  </select>
                  <select name="dobDay">
                    <option value="">Day</option>
                    ${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}
                  </select>
                  <select name="dobYear">
                    <option value="">Year</option>
                    ${Array.from({ length: 80 }, (_, i) => {
                      const year = new Date().getFullYear() - i;
                      return `<option value="${year}">${year}</option>`;
                    }).join("")}
                  </select>
                </div>
              </label>
              <label><span>Email</span><input name="email" type="email" placeholder="Email"></label>
              <label><span>Alternate Emails</span><input name="alternateEmails" placeholder="Alternate Emails"></label>
              <label><span>NPI</span><input name="npi" placeholder="NPI"></label>
              <label><span>Speciality</span><input name="speciality" placeholder="Speciality"></label>
              <label class="full"><span>Mailing Address</span><input name="mailingAddress" placeholder="Mailing Address"></label>
              <label><span>City</span><input name="city" placeholder="City"></label>
              <label><span>State</span><input name="state" placeholder="State"></label>
              <label><span>Zipcode</span><input name="zipcode" placeholder="Zipcode"></label>
              <label><span>Fax Number</span><input name="faxNumber" placeholder="Fax Number"></label>
              <label class="full"><span>Comment</span><input name="comment" placeholder="Comment"></label>
            </div>
          </section>

          <section class="facility-modal-section hidden" data-provider-modal-section="configuration">
            <h4>Configuration</h4>
            <div class="facility-modal-grid two">
              <label><span>Source</span><input name="source" placeholder="Source"></label>
              <label><span>Accounts</span><input name="accounts" placeholder="Facility name or comma-separated facility names"></label>
              <label class="full">
                <span>Password for Encrypted Reports</span>
                <div class="facility-inline-input">
                  <input name="encryptedReportsPassword" type="password" placeholder="Enter Password">
                  <button type="button" class="btn-ghost mini" data-provider-generate-password data-target="encryptedReportsPassword">Generate Password</button>
                </div>
              </label>
            </div>
            <div class="facility-setting-list">
              <label><input type="checkbox" name="sendEmail"> Send Email</label>
              <label><input type="checkbox" name="sendFax"> Send Fax</label>
              <label><input type="checkbox" name="sendWhatsapp"> Send WhatsApp</label>
            </div>
          </section>

          <section class="facility-modal-section hidden" data-provider-modal-section="signature">
            <h4>Signature</h4>
            <div class="facility-signature-upload">
              <p>Upload your provider signature image (.png, .jpeg, .jpg).</p>
              <input name="signatureImage" type="file" accept=".png,.jpg,.jpeg">
            </div>
          </section>

          <section class="facility-modal-section hidden" data-provider-modal-section="provider-access">
            <h4>Login and Access</h4>
            <p class="subtle">Configure provider portal access.</p>
            <div class="facility-access-cards">
              ${buildPortalAccessCards("no_login", "Providers").replaceAll('name="accessType"', 'name="providerAccessType"')}
            </div>
            <div id="provider-login-credentials" class="facility-modal-grid two hidden">
              <label><span>Username *</span><input name="providerPortalUsername" placeholder="Username"></label>
              <label>
                <span>Password *</span>
                <div class="facility-inline-input">
                  <input name="providerPortalPassword" type="password" placeholder="Password">
                  <button type="button" class="btn-ghost mini" data-provider-generate-password data-target="providerPortalPassword">Generate Password</button>
                </div>
              </label>
              <label>
                <span>Default Language</span>
                <select name="providerDefaultLanguage">
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                </select>
              </label>
              <label><span>Portal Contact</span><input name="providerPortalContact" placeholder="Enter Contact Number"></label>
            </div>
            <p class="subtle">Leave password blank during edit to keep the current password.</p>
            <div class="facility-setting-list">
              <label><input type="checkbox" name="providerLinkExistingAccount"> Link with existing account</label>
            </div>
            <div class="facility-login-status" id="facility-provider-login-status"></div>
            <div class="facility-modal-login-actions">
              <button type="button" class="btn-primary mini" data-update-provider-login-config>Update Login Configuration</button>
            </div>
          </section>

          <p id="facility-provider-modal-error" class="error" aria-live="polite"></p>
          <div class="facility-modal-footer">
            <button type="button" class="btn-ghost" data-provider-modal-close>Close</button>
            <button type="submit" class="btn-primary">${editMode ? "Update Provider" : "Add Provider"}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  const form = modal.querySelector("#facility-create-provider-form");
  const errorNode = modal.querySelector("#facility-provider-modal-error");
  const providerNameInput = form.querySelector('input[name="providerName"]');
  const displayNameInput = form.querySelector('input[name="displayName"]');
  const providerUsernameInput = form.querySelector('input[name="providerPortalUsername"]');
  const providerPasswordInput = form.querySelector('input[name="providerPortalPassword"]');
  const loginCredentialsWrap = modal.querySelector("#provider-login-credentials");
  const loginStatusNode = modal.querySelector("#facility-provider-login-status");
  const navButtons = Array.from(modal.querySelectorAll("[data-provider-modal-nav]"));
  const sectionNodes = Array.from(modal.querySelectorAll("[data-provider-modal-section]"));

  if (editMode) {
    const providerInfo =
      existingProvider?.provider_information && typeof existingProvider.provider_information === "object"
        ? existingProvider.provider_information
        : {};
    const configuration =
      existingProvider?.provider_configuration && typeof existingProvider.provider_configuration === "object"
        ? existingProvider.provider_configuration
        : {};
    const signature =
      existingProvider?.provider_signature && typeof existingProvider.provider_signature === "object"
        ? existingProvider.provider_signature
        : {};
    const loginAccess =
      existingProvider?.provider_login_access && typeof existingProvider.provider_login_access === "object"
        ? existingProvider.provider_login_access
        : {};
    const portal = existingProvider?.portal && typeof existingProvider.portal === "object" ? existingProvider.portal : {};
    const parsedName = parseProviderDisplayName(existingProvider.validator_name);
    const accessType =
      loginAccess.accessType ||
      existingProvider.portal_access ||
      (String(existingProvider.portal_enabled || "").toLowerCase() === "yes" ? "report_view" : "no_login");
    const designationValue =
      providerInfo.designation !== undefined && providerInfo.designation !== null
        ? providerInfo.designation
        : parsedName.designation;

    assignFieldValue(form, "providerNpiSearch", providerInfo.npi || existingProvider.npi);
    assignFieldValue(form, "designation", designationValue);
    assignFieldValue(form, "providerName", providerInfo.providerName || existingProvider.provider_name || parsedName.providerName);
    assignFieldValue(
      form,
      "displayName",
      providerInfo.displayName || existingProvider.display_name || existingProvider.provider_name || parsedName.providerName
    );
    assignFieldValue(form, "contactNo", providerInfo.contactNo || existingProvider.contact_no);
    assignFieldValue(form, "extension", providerInfo.extension || existingProvider.extension);
    assignFieldValue(form, "dobMonth", providerInfo.dobMonth || existingProvider.dob_month);
    assignFieldValue(form, "dobDay", providerInfo.dobDay || existingProvider.dob_day);
    assignFieldValue(form, "dobYear", providerInfo.dobYear || existingProvider.dob_year);
    assignFieldValue(form, "email", providerInfo.email || existingProvider.email_id);
    assignFieldValue(form, "alternateEmails", providerInfo.alternateEmails || existingProvider.alternate_emails);
    assignFieldValue(form, "npi", providerInfo.npi || existingProvider.npi);
    assignFieldValue(form, "speciality", providerInfo.speciality || existingProvider.speciality);
    assignFieldValue(form, "mailingAddress", providerInfo.mailingAddress || existingProvider.mailing_address);
    assignFieldValue(form, "city", providerInfo.city || existingProvider.city);
    assignFieldValue(form, "state", providerInfo.state || existingProvider.state);
    assignFieldValue(form, "zipcode", providerInfo.zipcode || existingProvider.zipcode);
    assignFieldValue(form, "faxNumber", providerInfo.faxNumber || existingProvider.fax_number);
    assignFieldValue(form, "comment", providerInfo.comment || existingProvider.comment);

    assignFieldValue(form, "source", configuration.source || existingProvider.business_source);
    assignFieldValue(form, "accounts", configuration.accounts || existingProvider.account);
    assignFieldValue(
      form,
      "encryptedReportsPassword",
      configuration.encryptedReportsPassword || existingProvider.encrypted_reports_password
    );
    assignChecked(form, "sendEmail", configuration.sendEmail ?? existingProvider.send_email);
    assignChecked(form, "sendFax", configuration.sendFax ?? existingProvider.send_fax);
    assignChecked(form, "sendWhatsapp", configuration.sendWhatsapp ?? existingProvider.send_whatsapp);

    const accessInput = form.querySelector(`input[name="providerAccessType"][value="${accessType}"]`);
    if (accessInput) accessInput.checked = true;
    assignFieldValue(form, "providerPortalUsername", existingProvider.portal_username || portal.username);
    assignFieldValue(form, "providerPortalPassword", "");
    assignFieldValue(
      form,
      "providerDefaultLanguage",
      loginAccess.defaultLanguage || existingProvider.portal_default_language || portal.defaultLanguage || "English"
    );
    assignFieldValue(form, "providerPortalContact", loginAccess.portalContact || portal.portalContact);
    assignChecked(form, "providerLinkExistingAccount", loginAccess.linkExistingAccount ?? portal.linkExistingAccount);

    if (signature.fileName || existingProvider.signature_file_name) {
      const signatureWrap = modal.querySelector(".facility-signature-upload");
      if (signatureWrap) {
        const existingInfo = document.createElement("p");
        existingInfo.className = "subtle";
        existingInfo.textContent = `Current file: ${signature.fileName || existingProvider.signature_file_name}`;
        signatureWrap.appendChild(existingInfo);
      }
    }
  }

  function syncSectionVisibility() {
    navButtons.forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-provider-modal-nav") === facilityProviderModalSection);
    });
    sectionNodes.forEach((node) => {
      node.classList.toggle("hidden", node.getAttribute("data-provider-modal-section") !== facilityProviderModalSection);
    });
  }

  function syncAccessCards() {
    const accessType = form.querySelector('input[name="providerAccessType"]:checked')?.value || "no_login";
    modal.querySelectorAll(".facility-access-card").forEach((card) => {
      const value = card.querySelector('input[name="providerAccessType"]')?.value;
      card.classList.toggle("active", value === accessType);
    });
    loginCredentialsWrap.classList.toggle("hidden", accessType === "no_login");
    renderLoginStatus();
  }

  function renderLoginStatus() {
    if (!loginStatusNode) return;
    const accessType = form.querySelector('input[name="providerAccessType"]:checked')?.value || "no_login";
    const portalEnabled = accessType !== "no_login";
    const username = String(providerUsernameInput?.value || "").trim();
    const hasExistingPassword = recordHasConfiguredPortalPassword(existingProvider);
    const hasNewPassword = Boolean(String(providerPasswordInput?.value || "").trim());
    const hasPassword = portalEnabled ? hasExistingPassword || hasNewPassword : false;
    const loginReady = portalEnabled && Boolean(username) && hasPassword;

    loginStatusNode.innerHTML = `
      <p><strong>Login Status:</strong> ${portalEnabled ? "Enabled" : "Disabled"}</p>
      <p><strong>Username:</strong> ${username ? "Configured" : "Missing"}</p>
      <p><strong>Password:</strong> ${hasPassword ? "Configured" : "Missing"}</p>
      <p><strong>Client Portal Ready:</strong> <span class="${loginReady ? "status-ready" : "status-not-ready"}">${loginReady ? "Yes" : "No"}</span></p>
    `;
  }

  syncSectionVisibility();
  syncAccessCards();
  renderLoginStatus();

  async function fetchAndApplyProviderLookup(fetchButton) {
    const npiSearch = form.querySelector('input[name="providerNpiSearch"]');
    const currentNpi = form.querySelector('input[name="npi"]');
    const normalizedNpi = normalizeNpiLookupValue(
      npiSearch?.value || currentNpi?.value || ""
    );

    if (normalizedNpi.length !== 10) {
      showModalError("Provider NPI must be 10 digits.", "provider-info");
      npiSearch?.focus();
      return;
    }

    errorNode.textContent = "";
    if (npiSearch) npiSearch.value = normalizedNpi;

    const originalLabel = fetchButton.textContent;
    fetchButton.disabled = true;
    fetchButton.textContent = "Fetching...";

    try {
      const provider = await fetchProviderDetailsByNpi(normalizedNpi);
      applyProviderLookupToProviderForm(form, provider);
    } catch (error) {
      showModalError(error.message || "Unable to fetch provider information.", "provider-info");
    } finally {
      fetchButton.disabled = false;
      fetchButton.textContent = originalLabel;
    }
  }

  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-provider-modal-close]")) {
      closeFacilityModals();
      return;
    }

    const navBtn = event.target.closest("[data-provider-modal-nav]");
    if (navBtn) {
      facilityProviderModalSection = navBtn.getAttribute("data-provider-modal-nav") || "provider-info";
      syncSectionVisibility();
      return;
    }

    const providerFetchButton = event.target.closest("[data-provider-npi-fetch]");
    if (providerFetchButton) {
      fetchAndApplyProviderLookup(providerFetchButton);
      return;
    }

    const generateBtn = event.target.closest("[data-provider-generate-password]");
    if (generateBtn) {
      const targetName = generateBtn.getAttribute("data-target");
      if (!targetName) return;
      const targetInput = form.querySelector(`input[name="${targetName}"]`);
      if (targetInput) targetInput.value = generateStrongPassword(12);
      renderLoginStatus();
      return;
    }

    if (event.target.closest("[data-update-provider-login-config]")) {
      facilityProviderModalSection = "provider-access";
      syncSectionVisibility();
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
    }
  });

  form.addEventListener("change", (event) => {
    if (event.target.matches('input[name="providerAccessType"]')) {
      syncAccessCards();
    }
    if (event.target.matches('input[name="providerPortalUsername"], input[name="providerPortalPassword"]')) {
      renderLoginStatus();
    }
  });

  providerUsernameInput?.addEventListener("input", renderLoginStatus);
  providerPasswordInput?.addEventListener("input", renderLoginStatus);

  providerNameInput?.addEventListener("input", () => {
    if (displayNameInput && !displayNameInput.value.trim()) {
      displayNameInput.value = providerNameInput.value;
    }
    if (providerUsernameInput && !providerUsernameInput.value.trim()) {
      providerUsernameInput.value = providerNameInput.value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".");
    }
    renderLoginStatus();
  });

  function showModalError(message, sectionKey) {
    errorNode.textContent = message;
    if (sectionKey) {
      facilityProviderModalSection = sectionKey;
      syncSectionVisibility();
    }
    errorNode.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!csrfToken) await fetchCsrfToken().catch(() => {});
    errorNode.textContent = "";

    const data = Object.fromEntries(new FormData(form).entries());
    const accessType = String(data.providerAccessType || "no_login");
    const portalEnabled = accessType !== "no_login";
    const hasExistingPortalHash = recordHasConfiguredPortalPassword(existingProvider);
    const nextPortalPassword = String(data.providerPortalPassword || "");
    if (!String(data.providerName || "").trim()) {
      showModalError("Provider Name is required.", "provider-info");
      return;
    }
    if (portalEnabled) {
      if (!String(data.providerPortalUsername || "").trim()) {
        showModalError("Portal username is required for selected access.", "provider-access");
        return;
      }
      if ((!editMode || !hasExistingPortalHash) && nextPortalPassword.length < 8) {
        showModalError("Portal password must be at least 8 characters.", "provider-access");
        return;
      }
      if ((editMode && hasExistingPortalHash && nextPortalPassword) && nextPortalPassword.length < 8) {
        showModalError("Portal password must be at least 8 characters.", "provider-access");
        return;
      }
    }

    const signatureFileInput = form.querySelector('input[name="signatureImage"]');
    const signatureFileName = signatureFileInput?.files?.[0]?.name || existingProvider?.signature_file_name || "";

    const payload = {
      providerInfo: {
        designation: data.designation,
        providerName: data.providerName,
        displayName: data.displayName,
        contactNo: data.contactNo,
        extension: data.extension,
        dobMonth: data.dobMonth,
        dobDay: data.dobDay,
        dobYear: data.dobYear,
        email: data.email,
        alternateEmails: data.alternateEmails,
        npi: data.npi,
        speciality: data.speciality,
        mailingAddress: data.mailingAddress,
        city: data.city,
        state: data.state,
        zipcode: data.zipcode,
        faxNumber: data.faxNumber,
        comment: data.comment,
      },
      configuration: {
        source: data.source,
        accounts: data.accounts,
        encryptedReportsPassword: data.encryptedReportsPassword,
        sendEmail: Boolean(form.querySelector('input[name="sendEmail"]')?.checked),
        sendFax: Boolean(form.querySelector('input[name="sendFax"]')?.checked),
        sendWhatsapp: Boolean(form.querySelector('input[name="sendWhatsapp"]')?.checked),
      },
      signature: {
        fileName: signatureFileName,
      },
      loginAccess: {
        accessType,
        username: data.providerPortalUsername,
        password: data.providerPortalPassword,
        defaultLanguage: data.providerDefaultLanguage,
        portalContact: data.providerPortalContact,
        linkExistingAccount: Boolean(form.querySelector('input[name="providerLinkExistingAccount"]')?.checked),
      },
    };

    const submitButton = form.querySelector('button[type="submit"]');
    const submitLabel = submitButton ? submitButton.textContent : "";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = editMode ? "Updating..." : "Creating...";
    }

    try {
      const endpoint = editMode ? `/api/facility/providers/${encodeURIComponent(editIdentifier)}` : "/api/facility/providers";
      const result = await requestJson(endpoint, {
        method: editMode ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify(payload),
      });

      if (result?.provider) {
        if (editMode) {
          const providerIndex = resolveProviderIndexByIdentifier(editIdentifier);
          if (providerIndex >= 0) {
            facilityData.providers[providerIndex] = result.provider;
          } else {
            facilityData.providers = [result.provider, ...(facilityData.providers || [])];
          }
        } else {
          facilityData.providers = [result.provider, ...(facilityData.providers || [])];
        }
        facilityDataLoaded = true;
      } else {
        facilityDataLoaded = false;
      }

      facilityTab = "providers";
      facilityProvidersQuery = "";
      closeFacilityModals();
      if (currentView === "facility") renderFacility();
    } catch (error) {
      showModalError(error.message || (editMode ? "Unable to update provider." : "Unable to create provider."));
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitLabel;
      }
    }
  });
}

function renderFacility() {
  currentSearchInput = null;
  if (!facilityDataLoaded) {
    panelBody.innerHTML = `
      <section class="card starter-card">
        <p class="badge">Facility</p>
        <h3>Loading facility data...</h3>
      </section>
    `;
    loadFacilityData().then(() => {
      if (currentView === "facility") renderFacility();
    });
    return;
  }

  const accounts = facilityData.accounts;
  const providers = facilityData.providers;
  const filteredAccountEntries = accounts.reduce((list, row, index) => {
    if (!matchesAccountFilters(row, facilityAccountFilters)) return list;
    if (facilityAccountsDisabledOnly && !isAccountDisabled(row)) return list;
    list.push({
      row,
      index,
      identifier: resolveAccountIdentifier(row, index),
    });
    return list;
  }, []);
  const filteredProviderEntries = providers.reduce((list, row, index) => {
    if (!matchesProviderFilters(row, facilityProviderFilters)) return list;
    list.push({
      row,
      index,
      identifier: resolveProviderIdentifier(row, index),
    });
    return list;
  }, []);

  const activeEntries = facilityTab === "accounts" ? filteredAccountEntries : filteredProviderEntries;
  const activeRows = activeEntries.map((entry) => entry.row);
  const activeLabel = facilityTab === "accounts" ? "accounts" : "providers";
  const baseRows = facilityTab === "accounts" ? accounts : providers;
  const tableColumns = deriveFacilityColumns(baseRows, facilityTab, { mode: "table" });
  const exportColumns = deriveFacilityColumns(baseRows, facilityTab, { mode: "export" });
  const rowCountLabel =
    facilityTab === "accounts"
      ? `Rows: ${activeRows.length} of ${accounts.length}`
      : `Rows: ${activeRows.length} of ${providers.length}`;
  const isAccountTab = facilityTab === "accounts";
  const activeFilters = isAccountTab ? facilityAccountFilters : facilityProviderFilters;
  const isExpanded = Boolean(facilitySearchExpanded[facilityTab]);
  const canUseAgGrid = Boolean(window.agGrid && typeof window.agGrid.createGrid === "function");
  const searchTitle = isAccountTab ? "Account Search" : "Provider Search";
  const searchCopy = isAccountTab
    ? "Find accounts by name, contact, account code, and city."
    : "Find providers by name, contact, specialty, and state.";
  const primaryFields = isAccountTab
    ? `
      <label>
        <span>Account Name</span>
        <div class="input-with-icon">
          <input name="name" placeholder="Enter Account Name" value="${escapeHtml(activeFilters.name)}">
          <span>⌕</span>
        </div>
      </label>
      <label>
        <span>Account Contact</span>
        <div class="input-with-icon">
          <input name="contact" placeholder="Enter Contact" value="${escapeHtml(activeFilters.contact)}">
          <span>⌕</span>
        </div>
      </label>
      <label>
        <span>Account Code</span>
        <input name="accountCode" placeholder="Enter Account Code" value="${escapeHtml(activeFilters.accountCode)}">
      </label>
    `
    : `
      <label>
        <span>Provider Name</span>
        <div class="input-with-icon">
          <input name="name" placeholder="Enter Provider Name" value="${escapeHtml(activeFilters.name)}">
          <span>⌕</span>
        </div>
      </label>
      <label>
        <span>Provider Contact</span>
        <div class="input-with-icon">
          <input name="contact" placeholder="Enter Contact" value="${escapeHtml(activeFilters.contact)}">
          <span>⌕</span>
        </div>
      </label>
      <label>
        <span>Specialty</span>
        <input name="specialty" placeholder="Enter Specialty" value="${escapeHtml(activeFilters.specialty || "")}">
      </label>
    `;
  const secondaryFields = isAccountTab
    ? `
      <label><span>City</span><input name="city" placeholder="Enter City" value="${escapeHtml(activeFilters.city || "")}"></label>
      <label><span>Email</span><input name="email" placeholder="Enter Email" value="${escapeHtml(activeFilters.email || "")}"></label>
    `
    : `
      <label><span>State</span><input name="state" placeholder="Enter State" value="${escapeHtml(activeFilters.state || "")}"></label>
      <label><span>Email</span><input name="email" placeholder="Enter Email" value="${escapeHtml(activeFilters.email || "")}"></label>
    `;
  const facilityActions = isAccountTab
    ? `
      <button type="button" class="facility-action-secondary ${facilityAccountsDisabledOnly ? "active" : ""}" data-facility-action="toggle-disabled">Disabled Accounts</button>
      <button type="button" class="facility-action-primary" data-facility-action="export-accounts">Export</button>
      <button type="button" class="facility-action-primary" data-facility-action="add-account">Add Account</button>
    `
    : `
      <button type="button" class="facility-action-tertiary" data-facility-action="bulk-upload-providers">Bulk Upload</button>
      <button type="button" class="facility-action-primary" data-facility-action="export-providers">Export</button>
      <button type="button" class="facility-action-primary" data-facility-action="add-provider">Add Provider</button>
    `;

  panelBody.innerHTML = `
    <section class="card">
      <div class="order-history-topbar">
        <div class="order-history-tabs">
          <button type="button" class="history-tab ${facilityTab === "accounts" ? "active" : ""}" data-facility-tab="accounts">Accounts</button>
          <button type="button" class="history-tab ${facilityTab === "providers" ? "active" : ""}" data-facility-tab="providers">Providers</button>
        </div>
      </div>
      <section class="patient-search-card facility-search-shell">
        <div class="facility-search-header">
          <h3>${searchTitle}</h3>
          <p>${searchCopy}</p>
        </div>
        <form id="facility-search-form">
          <div class="patient-search-grid facility-form-grid">
            ${primaryFields}
            <div class="patient-search-actions facility-search-actions">
              <button type="submit" id="facility-search-btn" class="btn-primary">Search</button>
              <button type="button" id="facility-search-more" class="btn-link">${isExpanded ? "Show Less ↑" : "Show More ↓"}</button>
              <button type="button" id="facility-search-clear" class="btn-link facility-clear-link">Clear</button>
            </div>
          </div>
          <div id="facility-search-more-panel" class="patient-search-more ${isExpanded ? "" : "hidden"}">
            <div class="patient-search-grid two-up">
              ${secondaryFields}
            </div>
          </div>
        </form>
        <div class="facility-account-actions facility-action-row">
          ${facilityActions}
        </div>
      </section>
      <div class="order-history-table-wrap facility-table-wrap">
        <div class="order-history-meta">${rowCountLabel}</div>
        ${
          activeEntries.length
            ? canUseAgGrid
              ? `<div id="facility-grid" class="ag-theme-quartz facility-grid"></div>`
              : buildFacilityTableMarkup(activeEntries, tableColumns, facilityTab)
            : `<div class="facility-grid-empty req-empty-cell">No ${activeLabel} loaded yet.</div>`
        }
      </div>
    </section>
  `;

  if (activeEntries.length && canUseAgGrid) {
    mountFacilityGrid(panelBody.querySelector("#facility-grid"), activeEntries, tableColumns, facilityTab);
  }

  panelBody.querySelector(".order-history-tabs")?.addEventListener("click", (event) => {
    const tabBtn = event.target.closest("[data-facility-tab]");
    if (!tabBtn) return;
    const nextTab = tabBtn.getAttribute("data-facility-tab");
    if (!nextTab || nextTab === facilityTab) return;
    facilityTab = nextTab;
    renderFacility();
  });

  panelBody.querySelector("#facility-search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (facilityTab === "accounts") {
      facilityAccountFilters = {
        name: String(formData.get("name") || "").trim(),
        contact: String(formData.get("contact") || "").trim(),
        accountCode: String(formData.get("accountCode") || "").trim(),
        city: String(formData.get("city") || "").trim(),
        email: String(formData.get("email") || "").trim(),
      };
    } else {
      facilityProviderFilters = {
        name: String(formData.get("name") || "").trim(),
        contact: String(formData.get("contact") || "").trim(),
        specialty: String(formData.get("specialty") || "").trim(),
        state: String(formData.get("state") || "").trim(),
        email: String(formData.get("email") || "").trim(),
      };
    }
    renderFacility();
  });

  panelBody.querySelector("#facility-search-more")?.addEventListener("click", () => {
    facilitySearchExpanded[facilityTab] = !facilitySearchExpanded[facilityTab];
    renderFacility();
  });

  panelBody.querySelector("#facility-search-clear")?.addEventListener("click", () => {
    if (facilityTab === "accounts") {
      facilityAccountFilters = { name: "", contact: "", accountCode: "", city: "", email: "" };
    } else {
      facilityProviderFilters = { name: "", contact: "", specialty: "", state: "", email: "" };
    }
    renderFacility();
  });

  panelBody.querySelector(".facility-action-row")?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-facility-action]");
    if (!actionButton) return;
    const action = actionButton.getAttribute("data-facility-action");
    if (!action) return;

    if (action === "toggle-disabled") {
      facilityAccountsDisabledOnly = !facilityAccountsDisabledOnly;
      renderFacility();
      return;
    }

    if (action === "export-accounts") {
      exportFacilityRows("accounts", activeRows, exportColumns);
      return;
    }

    if (action === "add-account") {
      openCreateAccountModal();
      return;
    }

    if (action === "bulk-upload-providers") {
      alert("Provider bulk upload will be added next.");
      return;
    }

    if (action === "export-providers") {
      exportFacilityRows("providers", activeRows, exportColumns);
      return;
    }

    if (action === "add-provider") {
      openCreateProviderModal();
    }
  });

  panelBody.querySelector(".facility-table-wrap")?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-facility-row-action]");
    if (!actionButton) return;
    const action = actionButton.getAttribute("data-facility-row-action");
    if (!action) return;

    const entity = actionButton.getAttribute("data-facility-entity");
    const identifier = actionButton.getAttribute("data-facility-id") || "";
    if (!identifier) return;

    if (entity === "accounts") {
      const accountIndex = resolveAccountIndexByIdentifier(identifier);
      if (accountIndex < 0) {
        alert("Unable to locate this account for editing.");
        return;
      }
      const focusAccess = action === "login-status";
      openCreateAccountModal(facilityData.accounts[accountIndex], identifier, { focusAccess });
      return;
    }

    if (entity === "providers") {
      const providerIndex = resolveProviderIndexByIdentifier(identifier);
      if (providerIndex < 0) {
        alert("Unable to locate this provider for editing.");
        return;
      }
      const focusAccess = action === "login-status";
      openCreateProviderModal(facilityData.providers[providerIndex], identifier, { focusAccess });
    }
  });
}

function formatAuditEventLabel(value) {
  return String(value || "event")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getAuditLogDetailText(entry) {
  const details = [];
  if (entry.patientId) details.push(`Patient ID ${entry.patientId}`);
  if (entry.orderId) details.push(`Order ${entry.orderId}`);
  if (entry.count !== undefined) details.push(`Count ${entry.count}`);
  if (entry.status) details.push(`Status ${entry.status}`);
  if (entry.reason) details.push(`Reason: ${entry.reason}`);
  if (entry.fileName) details.push(`File: ${entry.fileName}`);
  return details.join(" | ") || "-";
}

function renderAuditLogRows(entries) {
  if (!entries.length) {
    return '<tr><td colspan="6" class="audit-log-empty">No audit entries found.</td></tr>';
  }

  return entries
    .map((entry) => {
      const outcome = String(entry.outcome || "unknown").toLowerCase();
      return `
        <tr>
          <td>${escapeHtml(formatAppDateTime(entry.ts))}</td>
          <td><strong>${escapeHtml(formatAuditEventLabel(entry.event))}</strong></td>
          <td><span class="audit-outcome audit-outcome-${escapeHtml(outcome)}">${escapeHtml(outcome)}</span></td>
          <td>${escapeHtml(getAuditLogDetailText(entry))}</td>
          <td>${escapeHtml(entry.ip || "-")}</td>
          <td><span class="audit-session">${escapeHtml(entry.sessionId || "-")}</span></td>
        </tr>
      `;
    })
    .join("");
}

async function loadAuditLog({ force = false } = {}) {
  if (!auditLogState.authorized) {
    if (currentView === "audit-log") renderAuditLog();
    return;
  }
  if (auditLogState.loading && !force) return;
  auditLogState = {
    ...auditLogState,
    loading: true,
    error: "",
  };
  if (currentView === "audit-log") renderAuditLog();

  try {
    const payload = await requestJson("/api/audit-log?limit=250");
    auditLogState = {
      ...auditLogState,
      entries: Array.isArray(payload.entries) ? payload.entries : [],
      loading: false,
      error: "",
    };
  } catch (error) {
    auditLogState = {
      ...auditLogState,
      loading: false,
      error: error?.message || "Unable to load audit log.",
    };
  }

  if (currentView === "audit-log") renderAuditLog();
}

async function checkAuditLogAccess() {
  auditLogState = {
    ...auditLogState,
    checkingAccess: true,
    error: "",
  };
  renderAuditLog();

  try {
    const payload = await requestJson("/api/audit-log/status");
    auditLogState = {
      ...auditLogState,
      authorized: Boolean(payload.authorized),
      checkingAccess: false,
      error: "",
    };
    if (auditLogState.authorized) {
      await loadAuditLog({ force: true });
      return;
    }
  } catch (error) {
    auditLogState = {
      ...auditLogState,
      checkingAccess: false,
      error: error?.message || "Unable to check audit log access.",
    };
  }

  if (currentView === "audit-log") renderAuditLog();
}

async function authorizeAuditLogAccess(pin) {
  auditLogState = {
    ...auditLogState,
    pinSubmitting: true,
    error: "",
    pinFailed: false,
  };
  renderAuditLog();

  try {
    if (!csrfToken) await fetchCsrfToken();
    const payload = await requestJson("/api/audit-log/authorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({ pin }),
    });
    auditLogState = {
      ...auditLogState,
      authorized: Boolean(payload.authorized),
      pinSubmitting: false,
      error: "",
      pinFailed: false,
    };
    await loadAuditLog({ force: true });
  } catch (error) {
    navigator.vibrate?.([70, 35, 70]);
    auditLogState = {
      ...auditLogState,
      pinSubmitting: false,
      error: error?.message || "Incorrect PIN. Please try again.",
      pinFailed: true,
    };
    if (currentView === "audit-log") renderAuditLog();
  }
}

function renderAuditLogGate() {
  const { checkingAccess, pinSubmitting, error, pinFailed } = auditLogState;
  const isBusy = checkingAccess || pinSubmitting;
  const pinDots = Array.from({ length: 4 }, (_, index) => `<span class="audit-pin-dot" data-index="${index}" aria-hidden="true"></span>`).join("");
  return `
    <section class="audit-log-gate">
      <div class="audit-log-gate-panel ${pinFailed ? "is-invalid" : ""}">
        <div class="audit-log-lock-mark" aria-hidden="true">
          <span class="audit-log-lock-shackle"></span>
          <span class="audit-log-lock-body"></span>
        </div>
        <p class="badge">Protected Area</p>
        <h3>Unlock Audit Log</h3>
        <p class="subtle">Enter the 4-digit admin PIN to view recent security and workflow activity.</p>
        <form id="audit-log-pin-form" class="audit-log-pin-form">
          <label>
            <span>Admin PIN</span>
            <div class="audit-pin-entry">
              <input id="audit-log-pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" aria-describedby="audit-log-pin-status" placeholder="0000" ${isBusy ? "disabled" : ""}>
              <div class="audit-pin-visual" aria-hidden="true">${pinDots}</div>
            </div>
          </label>
          <button type="submit" class="btn-primary audit-log-unlock-btn" ${isBusy ? "disabled" : ""}>${checkingAccess ? "Checking..." : pinSubmitting ? "Unlocking..." : "Unlock Audit Log"}</button>
        </form>
        <p id="audit-log-pin-status" class="audit-log-pin-status ${error ? "is-error" : ""}" aria-live="polite">
          ${error ? `${escapeHtml(error)} Please try again.` : "Only authorized admins can open this log."}
        </p>
      </div>
    </section>
  `;
}

function renderAuditLog() {
  const { entries, loading, error } = auditLogState;
  if (!auditLogState.authorized) {
    panelBody.innerHTML = renderAuditLogGate();
    const form = document.getElementById("audit-log-pin-form");
    const pinInput = document.getElementById("audit-log-pin");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const pin = String(pinInput?.value || "").trim();
      if (!/^\d{4}$/.test(pin)) {
        navigator.vibrate?.([70, 35, 70]);
        auditLogState = {
          ...auditLogState,
          error: "Enter the 4-digit admin PIN.",
          pinFailed: true,
        };
        renderAuditLog();
        document.getElementById("audit-log-pin")?.focus();
        return;
      }
      authorizeAuditLogAccess(pin);
    });
    pinInput?.addEventListener("input", () => {
      const value = String(pinInput.value || "").replace(/\D/g, "").slice(0, 4);
      if (pinInput.value !== value) pinInput.value = value;
      document.querySelectorAll(".audit-pin-dot").forEach((dot, index) => {
        dot.classList.toggle("is-filled", index < value.length);
      });
      if (auditLogState.pinFailed) {
        auditLogState = {
          ...auditLogState,
          error: "",
          pinFailed: false,
        };
        const panel = document.querySelector(".audit-log-gate-panel");
        const status = document.getElementById("audit-log-pin-status");
        panel?.classList.remove("is-invalid");
        status?.classList.remove("is-error");
        if (status) status.textContent = "Only authorized admins can open this log.";
      }
    });
    if (!auditLogState.checkingAccess && !auditLogState.pinSubmitting) pinInput?.focus();
    return;
  }

  panelBody.innerHTML = `
    <section class="audit-log-page">
      <div class="audit-log-toolbar">
        <div>
          <h3>Recent Activity</h3>
          <p class="subtle">${entries.length ? `${entries.length} latest entries` : "Security and workflow events recorded by the server."}</p>
        </div>
        <button type="button" class="secondary-btn" id="audit-log-refresh" ${loading ? "disabled" : ""}>${loading ? "Refreshing..." : "Refresh"}</button>
      </div>
      ${error ? `<p class="form-status error">${escapeHtml(error)}</p>` : ""}
      <div class="audit-log-table-wrap">
        <table class="audit-log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Outcome</th>
              <th>Details</th>
              <th>IP</th>
              <th>Session</th>
            </tr>
          </thead>
          <tbody>
            ${loading ? '<tr><td colspan="6" class="audit-log-empty">Loading audit log...</td></tr>' : renderAuditLogRows(entries)}
          </tbody>
        </table>
      </div>
    </section>
  `;

  const refreshButton = document.getElementById("audit-log-refresh");
  refreshButton?.addEventListener("click", () => loadAuditLog({ force: true }));
}

function renderAdminSettings(options = {}) {
  currentSearchInput = null;
  const nowIso = new Date().toISOString();
  const forceReload = Boolean(options.forceReload);
  if (!adminSettingsReady || forceReload) {
    panelBody.innerHTML = `
      <section class="card starter-card admin-settings-card">
        <p class="badge">Admin Settings</p>
        <h3>Loading protected settings...</h3>
        <p class="subtle">Fetching the current application time zone.</p>
      </section>
    `;
    ensureAdminSettingsLoaded(forceReload)
      .then(() => {
        if (currentView === "admin-settings") renderAdminSettings();
      })
      .catch((error) => {
        if (currentView !== "admin-settings") return;
        panelBody.innerHTML = `
          <section class="card starter-card admin-settings-card">
            <p class="badge">Admin Settings</p>
            <h3>Unable to load admin settings.</h3>
            <p class="subtle">${escapeHtml(error?.message || "Unexpected settings error.")}</p>
            <button type="button" class="btn-primary" data-admin-settings-retry>Retry</button>
          </section>
        `;
        panelBody.querySelector("[data-admin-settings-retry]")?.addEventListener("click", () => {
          adminSettingsReady = false;
          adminSettingsPromise = null;
          renderAdminSettings({ forceReload: true });
        });
      });
    return;
  }

  panelBody.innerHTML = `
    <section class="card admin-settings-card">
      <div class="admin-settings-hero">
        <div>
          <p class="badge">Protected Setting</p>
          <h3>Application Time Zone</h3>
          <p class="subtle">Set the single IANA time zone used for new accession numbers and date formatting across the app.</p>
        </div>
        <button type="button" class="btn-ghost" data-admin-settings-refresh>Reload</button>
      </div>

      <div class="admin-settings-summary">
        <div class="admin-settings-summary-card">
          <span class="admin-settings-summary-label">Current Time Zone</span>
          <strong data-admin-current-timezone>${escapeHtml(adminSettingsState.timeZone || defaultAppTimeZone)}</strong>
          <span class="admin-settings-summary-meta" data-admin-current-offset>${escapeHtml(getTimeZoneOffsetLabel(adminSettingsState.timeZone || defaultAppTimeZone, nowIso))}</span>
        </div>
        <div class="admin-settings-summary-card">
          <span class="admin-settings-summary-label">Current Time In App Zone</span>
          <strong data-admin-current-time>${escapeHtml(formatAppDateTime(nowIso, {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }, "-"))}</strong>
        </div>
      </div>

      <form id="admin-settings-form" class="admin-settings-form">
        <label class="admin-settings-field">
          <span>Application Time Zone</span>
          <select
            id="admin-timezone-input"
            name="timeZone"
          >
            ${buildAdminTimeZoneOptionsMarkup(adminSettingsState.timeZone || defaultAppTimeZone, nowIso)}
          </select>
          <small>Uses standardized IANA time zone identifiers with the current UTC offset. This single setting is used by the server for accession generation and by the client for date and time rendering everywhere in the app.</small>
        </label>

        <div class="admin-settings-preview-card">
          <span class="admin-settings-summary-label">Selected Time Zone Preview</span>
          <strong data-admin-selected-timezone>${escapeHtml(adminSettingsState.timeZone || defaultAppTimeZone)}</strong>
          <span class="admin-settings-summary-meta" data-admin-selected-offset>${escapeHtml(getTimeZoneOffsetLabel(adminSettingsState.timeZone || defaultAppTimeZone, nowIso))}</span>
          <span data-admin-selected-time>${escapeHtml(formatDateTimeForTimeZone(
            nowIso,
            adminSettingsState.timeZone || defaultAppTimeZone,
            {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            },
            "-"
          ))}</span>
        </div>

        <label class="admin-settings-field">
          <span>4-Digit Admin PIN</span>
          <input
            id="admin-timezone-pin"
            name="pin"
            type="password"
            inputmode="numeric"
            maxlength="4"
            pattern="[0-9]{4}"
            placeholder="Enter PIN"
            autocomplete="off"
          >
          <small>Required to save this setting.</small>
        </label>

        <div class="admin-settings-actions">
          <button type="submit" class="btn-primary" data-admin-settings-save>Save Time Zone</button>
        </div>
        <p class="subtle admin-settings-status" data-admin-settings-status>
          Saving updates both new server-generated accessions and all client-rendered dates/times that use the shared app timezone helpers.
        </p>
      </form>
    </section>
  `;

  const form = document.getElementById("admin-settings-form");
  const timeZoneInput = document.getElementById("admin-timezone-input");
  const pinInput = document.getElementById("admin-timezone-pin");
  const saveButton = panelBody.querySelector("[data-admin-settings-save]");
  const reloadButton = panelBody.querySelector("[data-admin-settings-refresh]");
  const statusNode = panelBody.querySelector("[data-admin-settings-status]");
  const currentTimeZoneNode = panelBody.querySelector("[data-admin-current-timezone]");
  const currentOffsetNode = panelBody.querySelector("[data-admin-current-offset]");
  const currentTimeNode = panelBody.querySelector("[data-admin-current-time]");
  const selectedTimeZoneNode = panelBody.querySelector("[data-admin-selected-timezone]");
  const selectedOffsetNode = panelBody.querySelector("[data-admin-selected-offset]");
  const selectedTimeNode = panelBody.querySelector("[data-admin-selected-time]");

  function setStatus(message, tone = "info") {
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.classList.toggle("is-error", tone === "error");
    statusNode.classList.toggle("is-success", tone === "success");
  }

  function syncSelectedTimePreview(selectedValue = timeZoneInput?.value || adminSettingsState.timeZone || defaultAppTimeZone) {
    const previewTimeZone = resolveAppTimeZone(selectedValue);
    const previewNowIso = new Date().toISOString();
    if (selectedTimeZoneNode) {
      selectedTimeZoneNode.textContent = previewTimeZone;
    }
    if (selectedOffsetNode) {
      selectedOffsetNode.textContent = getTimeZoneOffsetLabel(previewTimeZone, previewNowIso);
    }
    if (selectedTimeNode) {
      selectedTimeNode.textContent = formatDateTimeForTimeZone(previewNowIso, previewTimeZone, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }, "-");
    }
  }

  function syncCurrentTimeSummary() {
    const currentNowIso = new Date().toISOString();
    if (currentTimeZoneNode) {
      currentTimeZoneNode.textContent = adminSettingsState.timeZone || defaultAppTimeZone;
    }
    if (currentOffsetNode) {
      currentOffsetNode.textContent = getTimeZoneOffsetLabel(adminSettingsState.timeZone || defaultAppTimeZone, currentNowIso);
    }
    if (currentTimeNode) {
      currentTimeNode.textContent = formatAppDateTime(currentNowIso, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }, "-");
    }
  }

  timeZoneInput?.addEventListener("change", () => {
    syncSelectedTimePreview(timeZoneInput.value);
  });

  syncSelectedTimePreview();

  reloadButton?.addEventListener("click", () => {
    adminSettingsReady = false;
    adminSettingsPromise = null;
    renderAdminSettings({ forceReload: true });
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const requestedTimeZone = String(timeZoneInput?.value || "").trim();
    const pin = String(pinInput?.value || "").trim();

    if (!requestedTimeZone) {
      setStatus("Time zone is required.", "error");
      timeZoneInput?.focus();
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setStatus("Enter the 4-digit admin PIN to save this setting.", "error");
      pinInput?.focus();
      return;
    }

    if (!csrfToken) {
      await fetchCsrfToken().catch(() => {});
    }

    const originalLabel = saveButton?.textContent || "Save Time Zone";
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Saving...";
    }
    setStatus("Saving application time zone...", "info");

    try {
      const payload = await requestJson("/api/admin/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          timeZone: requestedTimeZone,
          pin,
        }),
      });
      applyAdminSettingsPayload(payload);
      adminSettingsReady = true;
      if (timeZoneInput) {
        timeZoneInput.innerHTML = buildAdminTimeZoneOptionsMarkup(adminSettingsState.timeZone, new Date().toISOString());
        timeZoneInput.value = adminSettingsState.timeZone;
      }
      if (pinInput) pinInput.value = "";
      syncCurrentTimeSummary();
      syncSelectedTimePreview(adminSettingsState.timeZone);
      setStatus(`Time zone updated to ${adminSettingsState.timeZone} (${getTimeZoneOffsetLabel(adminSettingsState.timeZone)}) across server and client formatting.`, "success");
    } catch (error) {
      setStatus(error?.message || "Unable to update the application time zone.", "error");
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = originalLabel;
      }
    }
  });
}

function renderView() {
  function animatePanelTransition() {
    panelBody.classList.remove("view-transition");
    // Restart the animation class for each view render.
    void panelBody.offsetWidth;
    panelBody.classList.add("view-transition");
  }

  closeFacilityModals();
  const visibleViews = getVisibleViews();
  if (!visibleViews.length) {
    panelHeader.classList.remove("hidden");
    panelTitle.textContent = "Portal";
    panelSubtitle.textContent = "No views are enabled for this login.";
    panelBody.classList.remove("full-bleed");
    animatePanelTransition();
    panelBody.innerHTML = `
      <section class="card starter-card">
        <p class="badge">Access Restricted</p>
        <h3>No pages are assigned to your current access profile.</h3>
      </section>
    `;
    return;
  }
  if (!visibleViews.some((item) => item.key === currentView)) {
    currentView = visibleViews[0].key;
    renderNav();
  }
  const view = visibleViews.find((item) => item.key === currentView);
  if (!view) return;

  panelTitle.textContent = view.title;
  panelSubtitle.textContent = view.subtitle;

  panelHeader.classList.remove("hidden");
  panelBody.classList.remove("full-bleed");
  currentSearchInput = null;
  panelBody.innerHTML = "";
  animatePanelTransition();

  try {
    switch (view.key) {
      case "dashboard":
        renderDashboard();
        break;
      case "registration":
        panelHeader.classList.add("hidden");
        renderRegistration();
        break;
      case "patient-search":
        panelBody.classList.add("full-bleed");
        renderPatientSearch();
        break;
      case "order-history":
        panelBody.classList.add("full-bleed");
        renderOrderHistory();
        break;
      case "output-results":
        panelBody.classList.add("full-bleed");
        renderOutputResults();
        break;
      case "master-registry":
        panelBody.classList.add("full-bleed");
        renderMasterRegistry();
        break;
      case "panel-master":
        panelBody.classList.add("full-bleed");
        renderPanelMaster();
        break;
      case "formula-book":
        panelBody.classList.add("full-bleed");
        renderFormulaBook();
        break;
      case "facility":
        panelBody.classList.add("full-bleed");
        renderFacility();
        break;
      case "admin-settings":
        renderAdminSettings();
        break;
      case "audit-log":
        panelBody.classList.add("full-bleed");
        renderAuditLog();
        checkAuditLogAccess();
        break;
      default:
        panelBody.innerHTML = `
          <section class="card starter-card">
            <p class="badge">Unavailable</p>
            <h3>This view is not available.</h3>
          </section>
        `;
    }
  } catch (error) {
    console.error("renderView failed", { view: view.key, error });
    panelBody.innerHTML = `
      <section class="card starter-card">
        <p class="badge">Error</p>
        <h3>Unable to load ${escapeHtml(view.title)}</h3>
        <p class="subtle">${escapeHtml(error?.message || "Unexpected render error.")}</p>
      </section>
    `;
  }
}

async function mountApp() {
  document.body.classList.add("app-mode");
  authScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  setSessionMenuOpen(false);
  renderSessionSummary();
  panelBody.innerHTML = `
    <section class="card starter-card">
      <p class="badge">Loading</p>
      <h3>Syncing portal data...</h3>
    </section>
  `;
  await ensurePortalDataLoaded();
  renderNav();
  renderView();
  if (getVisibleViews().some((item) => item.key === "facility")) {
    loadFacilityData().catch(() => {});
  }
  startSessionMonitor();
}

function mountAuth() {
  stopSessionMonitor();
  portalDataReady = false;
  portalDataPromise = null;
  adminSettingsReady = false;
  adminSettingsPromise = null;
  auditLogState = {
    entries: [],
    loading: false,
    error: "",
    authorized: false,
    checkingAccess: false,
    pinSubmitting: false,
    pinFailed: false,
  };
  applyPortalDataPayload({
    registrations: [],
    orders: [],
    uploadResultsLog: [],
  });
  activeSession = createDefaultActiveSession();
  currentSearchInput = null;
  setSessionMenuOpen(false);
  renderSessionSummary();
  document.body.classList.remove("app-mode");
  appShell.classList.add("hidden");
  authScreen.classList.remove("hidden");
  closeFacilityModals();
  loginForm.reset();
  setAuthMode("doctor");
  setAuthStage("gateway");
  loginError.textContent = "";
}

async function performLogoutFlow({ postMessage = "" } = {}) {
  if (sessionLogoutInFlight) return;
  sessionLogoutInFlight = true;
  setSessionMenuOpen(false);
  closeSessionExpiryModal();

  let redirectingToIdp = false;

  try {
    if (!csrfToken) await fetchCsrfToken();
    const endpoint = activeSession.type === "client" ? "/api/client-auth/logout" : "/api/auth/logout";
    const logoutResult = await requestJson(endpoint, {
      method: "POST",
      headers: {
        "x-csrf-token": csrfToken,
      },
    });
    if (logoutResult?.logoutUrl) {
      redirectingToIdp = true;
      window.location.assign(logoutResult.logoutUrl);
      return;
    }
  } catch {
    // Ignore logout API failures and still reset UI locally.
  } finally {
    if (redirectingToIdp) {
      sessionLogoutInFlight = false;
      return;
    }
    csrfToken = "";
    await fetchCsrfToken().catch(() => {});
    mountAuth();
    if (postMessage) {
      loginError.textContent = postMessage;
    }
    sessionLogoutInFlight = false;
  }
}

authModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setAuthMode(button.getAttribute("data-auth-mode") || "doctor");
  });
});

authLaunchBtn?.addEventListener("click", () => {
  setAuthStage("login");
});

authBackBtn?.addEventListener("click", () => {
  loginError.textContent = "";
  setAuthStage("gateway");
});

doctorSsoBtn?.addEventListener("click", () => {
  if (pendingAuth) return;

  pendingAuth = true;
  loginError.textContent = "Redirecting to LabCenter Cloud ID...";

  ensureAuthConfigLoaded()
    .then(() => {
      window.location.assign(getAdminSsoLoginUrl());
    })
    .catch((error) => {
      pendingAuth = false;
      loginError.textContent = error?.message || "Unable to continue to LabCenter Cloud ID.";
    });
});

sessionMenuTrigger?.addEventListener("click", () => {
  setSessionMenuOpen(!sessionMenuOpen);
});

document.addEventListener("click", (event) => {
  if (!sessionMenuOpen) return;
  if (sessionMenuTrigger?.contains(event.target) || sessionMenu?.contains(event.target)) return;
  setSessionMenuOpen(false);
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (pendingAuth) return;

  const adminIdentifier = document.getElementById("doctor-email").value.trim().toLowerCase();
  const clientUsername = document.getElementById("client-username").value.trim().toLowerCase();
  const password = document.getElementById("doctor-password").value;
  const adminUsesOidc = authMode === "doctor" && getAdminAuthMode() === "oidc";

  if (adminUsesOidc) {
    doctorSsoBtn?.click();
    return;
  }

  if (authMode === "doctor" && (!adminIdentifier || password.length < 10)) {
    loginError.textContent = "Enter your admin username and a password with at least 10 characters.";
    return;
  }
  if (authMode === "client" && (!clientUsername || password.length < 8)) {
    loginError.textContent = "Enter a portal username and password with at least 8 characters.";
    return;
  }

  pendingAuth = true;
  loginError.textContent = "Signing in...";

  (async () => {
    try {
      if (!csrfToken) await fetchCsrfToken();
      const endpoint = authMode === "doctor" ? "/api/auth/login" : "/api/client-auth/login";
      const body =
        authMode === "doctor"
          ? { identifier: adminIdentifier, username: adminIdentifier, email: adminIdentifier, password }
          : {
              username: clientUsername,
              password,
            };

      const loginResult = await requestJson(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify(body),
      });
      csrfToken = loginResult.csrfToken || csrfToken;
      applySessionState(loginResult?.session);
      if (authMode === "doctor") {
        const doctorUser = loginResult?.user || {};
        activeSession = {
          type: "doctor",
          accessType: "full",
          accountId: doctorUser.id || "",
          accountName: doctorUser.displayName || "",
          username: doctorUser.username || doctorUser.email || adminIdentifier,
          displayName: doctorUser.displayName || "",
          email: doctorUser.email || "",
          entityType: "doctor",
        };
      } else {
        activeSession = {
          type: "client",
          accessType: loginResult?.clientUser?.accessType || "report_view",
          accountId: loginResult?.clientUser?.accountId || "",
          accountName: loginResult?.clientUser?.accountName || "",
          username: loginResult?.clientUser?.username || clientUsername,
          displayName: loginResult?.clientUser?.accountName || "",
          email: "",
          entityType: loginResult?.clientUser?.entityType || "account",
        };
      }
      loginError.textContent = "";
      await mountApp();
    } catch (error) {
      loginError.textContent = error.message || "Unable to sign in.";
      await fetchCsrfToken().catch(() => {});
    } finally {
      pendingAuth = false;
    }
  })();
});

logoutBtn.addEventListener("click", () => {
  performLogoutFlow().catch(() => {});
});

(async () => {
  await ensureAuthConfigLoaded().catch(() => {});

  try {
    await fetchCsrfToken();
    const authState = await requestJson("/api/auth/me");
    if (authState.authenticated) {
      const doctorUser = authState?.user || {};
      applySessionState(authState?.session);
      activeSession = {
        type: "doctor",
        accessType: "full",
        accountId: doctorUser.id || "",
        accountName: doctorUser.displayName || "",
        username: doctorUser.username || doctorUser.email || "",
        displayName: doctorUser.displayName || "",
        email: doctorUser.email || "",
        entityType: "doctor",
      };
      await mountApp();
      return;
    }
  } catch {
    // Default to auth screen when no valid server session exists.
  }

  try {
    const clientState = await requestJson("/api/client-auth/me");
    if (clientState.authenticated) {
      applySessionState(clientState?.session);
      activeSession = {
        type: "client",
        accessType: clientState?.clientUser?.accessType || "report_view",
        accountId: clientState?.clientUser?.accountId || "",
        accountName: clientState?.clientUser?.accountName || "",
        username: clientState?.clientUser?.username || "",
        displayName: clientState?.clientUser?.accountName || "",
        email: "",
        entityType: clientState?.clientUser?.entityType || "account",
      };
      await mountApp();
      return;
    }
  } catch {
    // Continue to auth screen.
  }

  mountAuth();
  const redirectedAuthMessage = consumeAuthRedirectMessage();
  if (redirectedAuthMessage) {
    setAuthMode("doctor");
    setAuthStage("login");
    loginError.textContent = redirectedAuthMessage;
  }
})();

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!appShell.contains(target)) return;
  if (!target.matches("input, textarea, select")) return;
  markSessionEditingActivity();
}, true);

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!appShell.contains(target)) return;
  if (!target.matches("input, textarea, select")) return;
  markSessionEditingActivity();
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sessionMenuOpen) {
    setSessionMenuOpen(false);
    sessionMenuTrigger?.focus();
    return;
  }

  const cmdOrCtrl = event.metaKey || event.ctrlKey;
  if (!cmdOrCtrl || event.key.toLowerCase() !== "j") return;
  if (!currentSearchInput) return;
  event.preventDefault();
  currentSearchInput.focus();
  currentSearchInput.select();
});
