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
    key: "master-registry",
    title: "Master Registry",
    subtitle: "Canonical pathogen and virus reference registry.",
  },
  {
    key: "panel-master",
    title: "Panel Master",
    subtitle: "Review panel catalog, ICD mappings, and accession prefixes.",
  },
];

const clientAccessViews = {
  report_view: ["dashboard", "patient-search", "order-history"],
  report_view_order: ["dashboard", "registration", "patient-search", "order-history"],
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
const appShell = document.getElementById("app-shell");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const authModeButtons = Array.from(document.querySelectorAll("[data-auth-mode]"));
const doctorEmailWrap = document.getElementById("doctor-email-wrap");
const clientUsernameWrap = document.getElementById("client-username-wrap");
const logoutBtn = document.getElementById("logout-btn");
const nav = document.getElementById("side-nav");
const panelTitle = document.getElementById("panel-title");
const panelSubtitle = document.getElementById("panel-subtitle");
const panelBody = document.getElementById("panel-body");
const panelHeader = document.getElementById("panel-header");

let csrfToken = "";
let pendingAuth = false;
let authMode = "doctor";
let activeSession = {
  type: "doctor",
  accessType: "full",
  accountId: "",
  accountName: "",
  username: "",
};
let currentView = "dashboard";
let requisitionSubtab = "create";
let facilityTab = "accounts";
let facilityAccountsQuery = "";
let facilityAccountsDisabledOnly = false;
let facilityProvidersQuery = "";
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
const registrationsStorageKey = "labcenter.registrations";
const ordersStorageKey = "labcenter.orders";
const uploadResultsLogStorageKey = "labcenter.upload-results-log.v1";
const orderIdSequenceResetStorageKey = "labcenter.order-id-sequence-reset.v1";
const panelCatalogStorageKey = "labcenter.panel-catalog.v1";
const masterRegistryStorageKey = "labcenter.master-registry.v1";
const orderIdPadLength = 5;
const orderIdStartNumber = 1;

function resetOrdersForPaddedOrderIdsOnce() {
  try {
    if (localStorage.getItem(orderIdSequenceResetStorageKey) === "done") return;
    localStorage.setItem(ordersStorageKey, "[]");
    localStorage.setItem(uploadResultsLogStorageKey, "[]");
    localStorage.setItem(orderIdSequenceResetStorageKey, "done");
  } catch {
    // Ignore storage failures and continue with in-memory behavior.
  }
}

resetOrdersForPaddedOrderIdsOnce();

function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
const icdCatalog = [
  { code: "U07.1", description: "Virus Identified" },
  { code: "U07.2 COVID-19", description: "Virus Not Identified" },
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

function getAllPanelIcdCodes() {
  return Array.from(
    new Set(
      icdCatalog
        .map((item) => String(item?.code || "").trim())
        .filter(Boolean)
    )
  );
}
const orderPanelCatalog = [
  { id: "attachment", name: "Attachment", alias: "Attachment", price: 0, icdCodes: ["Z01.812", "Z11.59", "Z03.818"] },
  { id: "gastrointestinal-panel", name: "Gastrointestinal Panel", alias: "Gastrointestinal Panel", price: 0, icdCodes: ["D50.9", "D51.9", "D64.9"] },
  { id: "nail-panel", name: "Nail Panel", alias: "Nail Panel", price: 0, icdCodes: ["B94.8", "D64.9"] },
  { id: "basic-flu-panel", name: "BASIC FLU PANEL", alias: "BASIC FLU PANEL", price: 0, icdCodes: ["U07.1", "U07.2 COVID-19", "Z11.52", "R50.9"] },
  { id: "final-report", name: "Final Report", alias: "ChoicePharmD", price: 1, icdCodes: ["Z01.812"] },
  { id: "upload-pdf", name: "Upload PDF", alias: "Upload PDF", price: 0, icdCodes: ["Z01.812"] },
  { id: "eye-panel", name: "Eye Panel", alias: "Eye Panel", price: 0, icdCodes: ["E03.9", "E11.9"] },
  { id: "molecular-test", name: "Molecular Test", alias: "Molecular Test", price: 0, icdCodes: ["U07.1", "U07.2 COVID-19", "Z20.828", "Z11.52", "Z20.822"] },
  { id: "wound-panel", name: "Wound Panel", alias: "Wound Panel", price: 0, icdCodes: ["B94.8", "Z20.822", "Z03.818"] },
  { id: "respiratory-pathogens-panel", name: "Respiratory Pathogens Panel", alias: "Respiratory Pathogens Panel", price: 0, icdCodes: ["U07.1", "U07.2 COVID-19", "Z11.59", "R50.9"] },
  { id: "sti-panel", name: "Sexually Transmitted Infection Panel", alias: "Sexually Transmitted Infection Panel", price: 0, icdCodes: ["Z01.812", "Z03.818", "E29.1"] },
  { id: "uti-pcr-panel", name: "Urinary Tract Infection PCR Panel", alias: "Urinary Tract Infection PCR Panel", price: 0, icdCodes: ["Z01.812", "Z11.59", "Z03.818"] },
  { id: "womens-health-panel", name: "Women's Health Panel", alias: "Women's Health Panel", price: 0, icdCodes: ["E28.2", "E03.9", "E11.9", "E34.9"] },
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
      icdCodes: Array.isArray(panel.icdCodes)
        ? Array.from(new Set(panel.icdCodes.map((code) => String(code || "").trim()).filter(Boolean)))
        : [],
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
      const icdCodes = Array.isArray(panel?.icdCodes)
        ? Array.from(new Set(panel.icdCodes.map((code) => String(code || "").trim()).filter(Boolean)))
        : [];
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

loadPanelCatalogState();

function syncAllPanelsToCatalogIcdCodes(options = {}) {
  const persist = Boolean(options.persist);
  const completeCodes = getAllPanelIcdCodes();
  let changed = false;

  orderPanelCatalog.forEach((panel) => {
    const existingCodes = Array.isArray(panel?.icdCodes)
      ? Array.from(new Set(panel.icdCodes.map((code) => String(code || "").trim()).filter(Boolean)))
      : [];
    const sameLength = existingCodes.length === completeCodes.length;
    const sameValues = sameLength && completeCodes.every((code, index) => existingCodes[index] === code);
    if (sameValues) return;
    panel.icdCodes = completeCodes.slice();
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
  const value = new Date(orderDateValue || "");
  const date = Number.isNaN(value.getTime()) ? new Date() : value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}${month}${year}`;
}

function buildAccessionNumber({ serviceLine, orderDate, orderId }) {
  const panelPrefix = resolvePanelPrefixFromService(serviceLine);
  const datePart = formatAccessionDate(orderDate);
  const orderPartRaw = String(orderId || "").trim();
  const orderPart = orderPartRaw.replace(/\D/g, "") || orderPartRaw || "00000";
  return `${panelPrefix}${datePart}${orderPart}`;
}

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212",
  "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221",
  "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221",
  "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321",
  "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131",
  "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131",
  "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242",
  "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311",
  "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

function normalizeCode128Value(value) {
  const raw = String(value || "").trim();
  if (!raw) return "UNKNOWN";
  return Array.from(raw)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code <= 126 ? char : "-";
    })
    .join("");
}

function escapeLabelHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapePdfString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "?");
}

function formatPdfNumber(value) {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return "0";
  return String(Math.round(asNumber * 1000) / 1000);
}

function buildCode128CodeSequence(value) {
  const payload = normalizeCode128Value(value);
  const startCodeB = 104;
  const stopCode = 106;
  const codes = [startCodeB];

  for (const char of payload) {
    codes.push(char.charCodeAt(0) - 32);
  }

  let checksum = startCodeB;
  for (let index = 1; index < codes.length; index += 1) {
    checksum += codes[index] * index;
  }
  checksum %= 103;
  codes.push(checksum, stopCode);
  return { payload, codes };
}

function buildSimplePdfDocument({ pageWidthPt, pageHeightPt, contentStream }) {
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatPdfNumber(pageWidthPt)} ${formatPdfNumber(pageHeightPt)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`;
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[5] = `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function buildLabelPdfBlob({ barcodeValue, patientLine }) {
  const pageWidthPt = 3.5 * 72;
  const pageHeightPt = 1.125 * 72;

  // Tuned to match the provided reference label proportions.
  const leftMargin = 2.5;
  const rightMargin = 2.5;
  const topMargin = 2;
  const quietModules = 4;
  const barHeight = 39.5;
  const codeFontSize = 15.8;
  const patientFontSize = 11.8;
  const codeBaselineY = 15.6;
  const patientBaselineY = 2.8;

  const { payload, codes } = buildCode128CodeSequence(barcodeValue);
  const totalModules = (quietModules * 2) + codes.reduce((sum, code) => {
    const pattern = CODE128_PATTERNS[code] || "";
    return sum + pattern.split("").reduce((inner, segment) => inner + Number(segment || 0), 0);
  }, 0);

  const drawWidth = pageWidthPt - leftMargin - rightMargin;
  const moduleWidth = drawWidth / Math.max(1, totalModules);
  const barBottom = pageHeightPt - topMargin - barHeight;
  const commands = ["0 0 0 rg"];

  let cursorX = leftMargin + (quietModules * moduleWidth);
  codes.forEach((code) => {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) return;
    for (let idx = 0; idx < pattern.length; idx += 1) {
      const segmentWidth = Number(pattern[idx]) * moduleWidth;
      if (idx % 2 === 0) {
        commands.push(`${formatPdfNumber(cursorX)} ${formatPdfNumber(barBottom)} ${formatPdfNumber(segmentWidth)} ${formatPdfNumber(barHeight)} re f`);
      }
      cursorX += segmentWidth;
    }
  });

  const codeLine = escapePdfString(payload).slice(0, 28);
  const patientText = escapePdfString(patientLine).slice(0, 72);
  commands.push(`BT /F1 ${formatPdfNumber(codeFontSize)} Tf ${formatPdfNumber(leftMargin)} ${formatPdfNumber(codeBaselineY)} Td (${codeLine}) Tj ET`);
  commands.push(`BT /F1 ${formatPdfNumber(patientFontSize)} Tf ${formatPdfNumber(leftMargin)} ${formatPdfNumber(patientBaselineY)} Td (${patientText}) Tj ET`);

  const pdf = buildSimplePdfDocument({
    pageWidthPt,
    pageHeightPt,
    contentStream: commands.join("\n"),
  });
  return new Blob([pdf], { type: "application/pdf" });
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

function sanitizeIcdCatalogRecord(raw) {
  const code = String(raw?.code || "").trim();
  if (!code) return null;
  return {
    code,
    description: String(raw?.description || "").trim(),
  };
}

function snapshotMasterRegistryState() {
  return {
    records: masterRegistryRecords.map((record, index) => sanitizeRegistryRecord(record, index)).filter(Boolean),
    genes: masterResistanceGeneCatalog.map((record) => sanitizeResistanceGeneRecord(record)).filter(Boolean),
    icdCodes: icdCatalog.map((record) => sanitizeIcdCatalogRecord(record)).filter(Boolean),
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
        .filter(Boolean);
      if (nextIcdCodes.length) {
        icdCatalog.splice(0, icdCatalog.length, ...nextIcdCodes);
        changed = true;
      }
    }

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

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
  });

  const rawText = await response.text();
  let payload = null;
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const fallback = `Request failed (${response.status} ${response.statusText}).`;
    const message = payload?.error || rawText || fallback;
    throw new Error(message);
  }

  return payload || {};
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
  authModeButtons.forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-auth-mode") === authMode);
  });
  doctorEmailWrap?.classList.toggle("hidden", authMode !== "doctor");
  clientUsernameWrap?.classList.toggle("hidden", authMode !== "client");
}

function renderRequisitionTabsMarkup() {
  return `
    <div class="req-subtabs" role="tablist" aria-label="Requisition sub tabs">
      <button type="button" class="req-subtab ${requisitionSubtab === "create" ? "active" : ""}" data-req-tab="create">Create Requisition</button>
      <button type="button" class="req-subtab ${requisitionSubtab === "view" ? "active" : ""}" data-req-tab="view">View Requisition</button>
    </div>
  `;
}

function attachRequisitionTabEvents() {
  const tabs = panelBody.querySelector(".req-subtabs");
  tabs?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-req-tab]");
    if (!btn) return;
    const nextTab = btn.getAttribute("data-req-tab");
    if (!nextTab || nextTab === requisitionSubtab) return;
    requisitionSubtab = nextTab;
    renderRegistration();
  });
}

function renderRequisitionList() {
  currentSearchInput = null;
  const allOrders = readOrders()
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const registrationsByPatientId = new Map();
  readRegistrations()
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .forEach((record) => {
      const key = String(record.patientId || "").trim();
      if (!key || registrationsByPatientId.has(key)) return;
      registrationsByPatientId.set(key, record);
    });

  function splitPatientName(fullName) {
    const value = String(fullName || "").trim().replace(/\s+/g, " ");
    if (!value) return { firstName: "-", lastName: "-" };
    const parts = value.split(" ");
    if (parts.length === 1) return { firstName: parts[0], lastName: "-" };
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
    };
  }

  panelBody.innerHTML = `
    <section class="req-view-page">
      ${renderRequisitionTabsMarkup()}

      <div class="req-view-header">
        <div class="req-view-selection"><span id="req-selected-count">0</span> records selected</div>
        <div class="req-view-header-actions">
          <button type="button" class="btn-primary req-mail-btn">Resend Result Email</button>
          <button type="button" class="btn-ghost req-tools-btn">Tools ▾</button>
        </div>
      </div>

      <div class="req-view-controls">
        <label class="req-control-inline">
          <select id="req-page-size">
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100" selected>100</option>
          </select>
          <span>records</span>
        </label>
        <div class="req-search-group">
          <input id="req-global-search" placeholder="Search by order, accession, patient name, or patient id">
          <button type="button" id="req-search-btn" class="btn-primary">Search</button>
          <button type="button" id="req-reset-btn" class="btn-ghost">Reset</button>
        </div>
        <div class="req-date-range">
          <label>From <input id="req-from-date" type="date"></label>
          <label>To <input id="req-to-date" type="date"></label>
        </div>
      </div>

      <div class="req-view-table-wrap">
        <table class="req-view-table">
          <thead>
            <tr>
              <th><input id="req-select-all" type="checkbox" aria-label="Select all requisitions"></th>
              <th>Order #</th>
              <th>Accession #</th>
              <th>First Name</th>
              <th>Last Name</th>
              <th>Date of Birth</th>
              <th>Gender</th>
              <th>Status</th>
              <th>View</th>
              <th>Print Label</th>
              <th>Result File</th>
              <th>Scanned File</th>
              <th>Test Type</th>
              <th>Lab Code</th>
              <th>Date of Collection</th>
              <th>Time (CST)</th>
            </tr>
            <tr class="req-filter-row">
              <th></th>
              <th><input class="req-col-filter" data-col="orderId" placeholder="Filter"></th>
              <th><input class="req-col-filter" data-col="accession" placeholder="Filter"></th>
              <th><input class="req-col-filter" data-col="firstName" placeholder="Filter"></th>
              <th><input class="req-col-filter" data-col="lastName" placeholder="Filter"></th>
              <th><input class="req-col-filter" data-col="dob" placeholder="DOB"></th>
              <th>
                <select class="req-col-filter" data-col="gender">
                  <option value="">Any</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </th>
              <th>
                <select class="req-col-filter" data-col="status">
                  <option value="">Any</option>
                  <option value="pending">Pending</option>
                  <option value="processed">Processed</option>
                  <option value="complete">Complete</option>
                  <option value="validated">Validated</option>
                </select>
              </th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th><input class="req-col-filter" data-col="testType" placeholder="Select Type"></th>
              <th><input class="req-col-filter" data-col="labCode" placeholder="Lab Code"></th>
              <th><input class="req-col-filter" data-col="collectionDate" placeholder="From"></th>
              <th><input class="req-col-filter" data-col="collectionTime" placeholder="--:-- --"></th>
            </tr>
          </thead>
          <tbody id="req-view-body"></tbody>
        </table>
      </div>
    </section>
  `;

  attachRequisitionTabEvents();

  const pageSizeInput = document.getElementById("req-page-size");
  const globalSearchInput = document.getElementById("req-global-search");
  const searchBtn = document.getElementById("req-search-btn");
  const resetBtn = document.getElementById("req-reset-btn");
  const fromDateInput = document.getElementById("req-from-date");
  const toDateInput = document.getElementById("req-to-date");
  const selectAllInput = document.getElementById("req-select-all");
  const tableBody = document.getElementById("req-view-body");
  const selectedCountNode = document.getElementById("req-selected-count");

  const columnFilters = {
    orderId: "",
    accession: "",
    firstName: "",
    lastName: "",
    dob: "",
    gender: "",
    status: "",
    testType: "",
    labCode: "",
    collectionDate: "",
    collectionTime: "",
  };
  let visibleRows = [];

  function formatDate(value) {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      const [year, month, day] = String(value).split("-");
      return `${Number(month)}/${Number(day)}/${year}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-US");
  }

  function formatTime(value) {
    if (!value) return "";
    if (/^\d{2}:\d{2}$/.test(String(value))) {
      const [hourRaw, minute] = String(value).split(":");
      const hour = Number(hourRaw);
      const period = hour >= 12 ? "PM" : "AM";
      const hour12 = ((hour + 11) % 12) + 1;
      return `${hour12}:${minute} ${period}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function getCollectionDateObject(source) {
    const raw = source?.sampleCollectTime || source?.collectionDate || source?.createdAt;
    const value = new Date(raw || "");
    return Number.isNaN(value.getTime()) ? null : value;
  }

  function getStatusClass(status) {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "pending") return "pending";
    if (normalized === "processed") return "processed";
    if (normalized === "complete") return "complete";
    return "validated";
  }

  function mapOrder(order, index) {
    const patientKey = String(order?.patientId || "").trim();
    const linkedRegistration = registrationsByPatientId.get(patientKey) || null;
    const nameParts = splitPatientName(order?.patientName || "");
    const fallbackRecord = {
      patientId: order?.patientId || "",
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      dob: order?.patientDob || "",
      sex: "",
      phone: "",
      mrn: "",
      provider: order?.provider || "",
      facilityName: order?.facilityName || "",
      collectionDate: "",
      collectionTime: "",
      labCode: "LABCENTER",
    };
    const sourceRecord = linkedRegistration ? { ...fallbackRecord, ...linkedRegistration } : fallbackRecord;

    const orderId = order?.orderId ? String(order.orderId) : `COI-${String(index + 1).padStart(6, "0")}`;
    const accession = String(order?.accessionNo || "").trim() || buildAccessionNumber({
      serviceLine: Array.isArray(order?.services) ? order.services[0] : null,
      orderDate: order?.sampleCollectTime || order?.createdAt || sourceRecord?.collectionDate,
      orderId,
    });
    const dateObj = getCollectionDateObject(order || sourceRecord);
    const status = order?.status || "Pending";
    const testType = Array.isArray(order?.services) && order.services.length
      ? order.services.map((line) => line?.serviceName).filter(Boolean).join(", ")
      : "Infectious Disease";
    return {
      raw: sourceRecord,
      orderId,
      accession,
      firstName: sourceRecord.firstName || "-",
      lastName: sourceRecord.lastName || "-",
      dob: formatDate(sourceRecord.dob),
      gender: sourceRecord.sex || "-",
      status,
      testType,
      labCode: sourceRecord.labCode || "LABCENTER",
      collectionDate: formatDate(sourceRecord.collectionDate || dateObj?.toISOString().slice(0, 10)),
      collectionTime: formatTime(sourceRecord.collectionTime || order?.sampleCollectTime || ""),
      collectionDateObj: dateObj,
      statusClass: getStatusClass(status),
    };
  }

  function rowMatchesFilters(row) {
    const globalNeedle = String(globalSearchInput.value || "").trim().toLowerCase();
    const fromDate = fromDateInput.value ? new Date(`${fromDateInput.value}T00:00:00`) : null;
    const toDate = toDateInput.value ? new Date(`${toDateInput.value}T23:59:59`) : null;

    if (globalNeedle) {
      const haystack = [row.orderId, row.accession, row.firstName, row.lastName, row.raw.patientId]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(globalNeedle)) return false;
    }

    if (fromDate && row.collectionDateObj && row.collectionDateObj < fromDate) return false;
    if (toDate && row.collectionDateObj && row.collectionDateObj > toDate) return false;
    if (fromDate && !row.collectionDateObj) return false;

    return Object.entries(columnFilters).every(([key, value]) => {
      if (!value) return true;
      const hay = String(row[key] || "").toLowerCase();
      return hay.includes(String(value).toLowerCase());
    });
  }

  function updateSelectedCount() {
    const checked = tableBody.querySelectorAll(".req-select-row:checked").length;
    selectedCountNode.textContent = String(checked);
    const total = tableBody.querySelectorAll(".req-select-row").length;
    selectAllInput.checked = total > 0 && checked === total;
    selectAllInput.indeterminate = checked > 0 && checked < total;
  }

  function renderRows() {
    const pageSize = Math.max(1, Number(pageSizeInput.value) || 100);
    const mapped = allOrders.map((item, idx) => mapOrder(item, idx));
    visibleRows = mapped.filter(rowMatchesFilters).slice(0, pageSize);

    tableBody.innerHTML = visibleRows.length
      ? visibleRows
          .map((row, idx) => `
            <tr>
              <td><input type="checkbox" class="req-select-row" data-row="${idx}"></td>
              <td>${row.orderId}</td>
              <td>${row.accession}</td>
              <td>${row.firstName}</td>
              <td>${row.lastName}</td>
              <td>${row.dob || "-"}</td>
              <td>${row.gender}</td>
              <td><span class="req-status-pill ${row.statusClass}">${row.status}</span></td>
              <td><button type="button" class="req-view-btn" data-view-row="${idx}">View</button></td>
              <td><button type="button" class="req-print-btn" data-print-row="${idx}">Print Label ▾</button></td>
              <td><button type="button" class="req-file-btn">PDF</button></td>
              <td><span class="req-scan-icon">□</span></td>
              <td>${row.testType}</td>
              <td>${row.labCode}</td>
              <td>${row.collectionDate || "-"}</td>
              <td>${row.collectionTime || "-"}</td>
            </tr>
          `)
          .join("")
      : '<tr><td colspan="16" class="req-empty-cell">No requisitions found for current filters.</td></tr>';

    updateSelectedCount();
  }

  panelBody.querySelectorAll(".req-col-filter").forEach((input) => {
    const col = input.getAttribute("data-col");
    const apply = () => {
      columnFilters[col] = input.value || "";
      renderRows();
    };
    input.addEventListener("input", apply);
    input.addEventListener("change", apply);
  });

  selectAllInput?.addEventListener("change", () => {
    const checked = Boolean(selectAllInput.checked);
    tableBody.querySelectorAll(".req-select-row").forEach((node) => {
      node.checked = checked;
    });
    updateSelectedCount();
  });

  tableBody.addEventListener("change", (event) => {
    if (event.target.matches(".req-select-row")) updateSelectedCount();
  });

  tableBody.addEventListener("click", (event) => {
    const printBtn = event.target.closest("[data-print-row]");
    if (printBtn) {
      const index = Number(printBtn.getAttribute("data-print-row"));
      if (Number.isInteger(index) && visibleRows[index]) {
        openBarcodeLabelPrint(visibleRows[index]);
      }
      return;
    }

    const viewBtn = event.target.closest("[data-view-row]");
    if (!viewBtn) return;
    const index = Number(viewBtn.getAttribute("data-view-row"));
    if (!Number.isInteger(index) || !visibleRows[index]) return;
    requisitionSubtab = "create";
    renderRegistration(visibleRows[index].raw);
  });

  searchBtn?.addEventListener("click", renderRows);
  globalSearchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      renderRows();
    }
  });
  fromDateInput?.addEventListener("change", renderRows);
  toDateInput?.addEventListener("change", renderRows);
  pageSizeInput?.addEventListener("change", renderRows);

  resetBtn?.addEventListener("click", () => {
    globalSearchInput.value = "";
    fromDateInput.value = "";
    toDateInput.value = "";
    pageSizeInput.value = "100";
    Object.keys(columnFilters).forEach((key) => {
      columnFilters[key] = "";
    });
    panelBody.querySelectorAll(".req-col-filter").forEach((node) => {
      node.value = "";
    });
    renderRows();
  });

  renderRows();
}

function formatDashboardNumber(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return "0";
  return parsed.toLocaleString("en-US");
}

function formatDashboardDateTime(isoValue) {
  if (!isoValue) return "-";
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const now = new Date();
  const buckets = [];
  for (let index = monthCount - 1; index >= 0; index -= 1) {
    const pivot = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const month = pivot.getMonth();
    const year = pivot.getFullYear();
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    buckets.push({
      key,
      label: pivot.toLocaleDateString("en-US", { month: "short" }),
      fullLabel: pivot.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      count: 0,
    });
  }

  const keyToBucket = new Map(buckets.map((item) => [item.key, item]));
  orders.forEach((order) => {
    const created = new Date(order.createdAt);
    if (Number.isNaN(created.getTime())) return;
    const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
    const bucket = keyToBucket.get(key);
    if (bucket) bucket.count += 1;
  });

  return buckets;
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
  const trendMax = Math.max(1, ...monthlyTrend.map((item) => item.count));
  const topPanels = Object.entries(panelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);
  const panelMax = Math.max(1, ...topPanels.map((item) => item[1]));

  const totalDisposition = statusCounts.pending + statusCounts.processed + statusCounts.complete + statusCounts.other;
  const pendingPct = totalDisposition ? (statusCounts.pending / totalDisposition) * 100 : 0;
  const processedPct = totalDisposition ? (statusCounts.processed / totalDisposition) * 100 : 0;
  const completePct = totalDisposition ? (statusCounts.complete / totalDisposition) * 100 : 0;
  const firstBreak = pendingPct;
  const secondBreak = pendingPct + processedPct;
  const thirdBreak = pendingPct + processedPct + completePct;
  const donutStyle = totalDisposition
    ? `background: conic-gradient(#f2b132 0 ${firstBreak}%, #2f7fd3 ${firstBreak}% ${secondBreak}%, #2ca86d ${secondBreak}% ${thirdBreak}%, #8f9cad ${thirdBreak}% 100%);`
    : "background: conic-gradient(#d3dbe4 0 100%);";

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

      <section class="dashboard-kpis">
        <article class="dashboard-kpi kpi-specimens">
          <p>Total Specimens Collected</p>
          <h4>${formatDashboardNumber(specimensCollected)}</h4>
          <span>Across ${formatDashboardNumber(orders.length)} orders</span>
        </article>
        <article class="dashboard-kpi kpi-samples">
          <p>Total Samples Captured</p>
          <h4>${formatDashboardNumber(samplesCollected)}</h4>
          <span>Includes processed workbook sample counts</span>
        </article>
        <article class="dashboard-kpi kpi-detected">
          <p>Detected Pathogens</p>
          <h4>${formatDashboardNumber(detectedPathogens)}</h4>
          <span>From ${formatDashboardNumber(totalRowsProcessed)} tested targets</span>
        </article>
        <article class="dashboard-kpi kpi-pending">
          <p>Pending Orders</p>
          <h4>${formatDashboardNumber(statusCounts.pending)}</h4>
          <span>${formatDashboardNumber(statusCounts.processed + statusCounts.complete)} completed or processed</span>
        </article>
      </section>

      <section class="dashboard-grid">
        <article class="dashboard-card dashboard-trend-card">
          <div class="dashboard-card-head">
            <h4>Order Progression (Last 6 Months)</h4>
            <span>${formatDashboardNumber(orders.length)} total orders</span>
          </div>
          <div class="dashboard-trend-chart">
            ${monthlyTrend
              .map((bucket) => {
                const ratio = bucket.count / trendMax;
                const height = bucket.count ? Math.max(12, Math.round(ratio * 100)) : 6;
                return `
                  <div class="trend-column" title="${bucket.fullLabel}: ${bucket.count}">
                    <div class="trend-bar" style="height: ${height}%">
                      <span>${bucket.count}</span>
                    </div>
                    <label>${bucket.label}</label>
                  </div>
                `;
              })
              .join("")}
          </div>
        </article>

        <article class="dashboard-card dashboard-disposition-card">
          <div class="dashboard-card-head">
            <h4>Specimen Disposition</h4>
            <span>Current order statuses</span>
          </div>
          <div class="dashboard-disposition">
            <div class="status-donut" style="${donutStyle}">
              <div class="status-donut-inner">${formatDashboardNumber(totalDisposition)}</div>
            </div>
            <div class="status-legend">
              <p><span class="dot pending"></span>Pending <strong>${formatDashboardNumber(statusCounts.pending)}</strong></p>
              <p><span class="dot processed"></span>Processed <strong>${formatDashboardNumber(statusCounts.processed)}</strong></p>
              <p><span class="dot complete"></span>Complete <strong>${formatDashboardNumber(statusCounts.complete)}</strong></p>
              <p><span class="dot other"></span>Other <strong>${formatDashboardNumber(statusCounts.other)}</strong></p>
              <p class="status-due">Outstanding Due: <strong>$${formatDashboardNumber(totalDue)}</strong></p>
            </div>
          </div>
        </article>

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
  try {
    return JSON.parse(localStorage.getItem(registrationsStorageKey) || "[]");
  } catch {
    return [];
  }
}

function writeRegistrations(items) {
  localStorage.setItem(registrationsStorageKey, JSON.stringify(items));
}

function saveRegistrationData(data) {
  const records = readRegistrations();
  records.unshift({
    ...data,
    createdAt: new Date().toISOString(),
  });
  writeRegistrations(records);
  return records.length;
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

  const aId = String(a.patientId || "").trim();
  const bId = String(b.patientId || "").trim();
  if (aId && bId && aId === bId) return true;

  const aMrn = normalizePatientText(a.mrn);
  const bMrn = normalizePatientText(b.mrn);
  if (aMrn && bMrn && aMrn === bMrn) return true;

  const aFirst = normalizePatientText(a.firstName);
  const bFirst = normalizePatientText(b.firstName);
  const aLast = normalizePatientText(a.lastName);
  const bLast = normalizePatientText(b.lastName);
  const aDob = String(a.dob || "").trim();
  const bDob = String(b.dob || "").trim();

  const coreMatch = aFirst && bFirst && aLast && bLast && aDob && bDob
    && aFirst === bFirst
    && aLast === bLast
    && aDob === bDob;

  if (!coreMatch) return false;

  const aPhone = normalizePhoneDigits(a.phone);
  const bPhone = normalizePhoneDigits(b.phone);
  if (aPhone && bPhone) return aPhone === bPhone;
  return true;
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
  try {
    return JSON.parse(localStorage.getItem(ordersStorageKey) || "[]");
  } catch {
    return [];
  }
}

function writeOrders(items) {
  localStorage.setItem(ordersStorageKey, JSON.stringify(items));
}

function readUploadResultsLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(uploadResultsLogStorageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUploadResultsLog(items) {
  localStorage.setItem(uploadResultsLogStorageKey, JSON.stringify(items));
}

function appendUploadResultsLog(entries) {
  const existing = readUploadResultsLog();
  const nextEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!nextEntries.length) return;
  const merged = [...nextEntries, ...existing].slice(0, 200);
  writeUploadResultsLog(merged);
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

function saveOrderRecord(record) {
  const orders = readOrders();
  orders.unshift(record);
  writeOrders(orders);
  return orders.length;
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
    patientId: record.patientId || "",
    firstName: record.firstName || "",
    middleName: record.middleName || "",
    lastName: record.lastName || "",
    sex: record.sex || "",
    dob: record.dob || "",
    phone: record.phone || "",
    mrn: record.mrn || "",
    provider: record.provider || "",
    facilityName: record.facilityName || "",
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
    createdAt: record.createdAt || "",
  };
}

function getSearchablePatients() {
  const saved = readRegistrations().map(asPatientRecord);
  return [...saved, ...patientDirectory];
}

function formatDateForCard(isoDate) {
  if (!isoDate) return "Unknown";
  const value = new Date(isoDate);
  if (Number.isNaN(value.getTime())) return isoDate;
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

function getFacilitySelectionKeys(facilityName = "") {
  const selectedFacility = String(facilityName || "").trim();
  const keys = new Set();
  if (!selectedFacility) return keys;

  keys.add(normalizeFacilityLinkKey(selectedFacility));

  const matchedAccount = (Array.isArray(facilityData?.accounts) ? facilityData.accounts : []).find((row) => {
    const candidates = [
      row?.name,
      row?.basic_information?.accountName,
      row?.facility_name,
      row?.facilityName,
    ];
    return candidates.some((item) => normalizeFacilityLinkKey(item) === normalizeFacilityLinkKey(selectedFacility));
  });

  if (matchedAccount) {
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
  }

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
    const candidate = String(
      row?.name ||
        row?.basic_information?.accountName ||
        row?.facility_name ||
        row?.facilityName ||
        ""
    ).trim();
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

function renderRegistration(prefillData = null) {
  if (prefillData) requisitionSubtab = "create";
  if (requisitionSubtab === "view") {
    renderRequisitionList();
    return;
  }

  panelBody.innerHTML = `
    <div class="requisition-top-controls">
      ${renderRequisitionTabsMarkup()}
      <div class="requisition-scan-strip">
        <div class="requisition-scan-copy">
          <p class="requisition-scan-title">Upload scan copy</p>
          <p class="requisition-scan-hint">Import a scanned requisition PDF or image and autofill the form fields we can recognize. Review the result before saving.</p>
        </div>
        <div class="requisition-scan-actions">
          <input id="requisition-scan-file" class="hidden" type="file" accept=".pdf,image/png,image/jpeg,image/jpg,image/heic,image/heif,image/tiff">
          <button type="button" id="requisition-scan-trigger" class="btn-ghost">Upload Scan Copy</button>
        </div>
      </div>
      <div class="reg-toolbar req-toolbar">
        <div class="search-wrap">
          <div class="search-input-row">
            <input id="patient-search" name="globalSearch" autocomplete="off" placeholder="Search By Name, Phone, National Id, MRN, DOB(MMDDYYYY)">
            <div class="search-actions">
              <button id="search-clear" class="search-icon-btn" type="button" aria-label="Clear search">×</button>
              <button class="search-icon-btn" type="button" aria-label="Search">⌕</button>
              <button class="search-icon-btn" type="button" aria-label="Filters">▥</button>
            </div>
          </div>
          <div id="search-results" class="search-results hidden"></div>
          <span class="search-kbd">cmd+j</span>
        </div>
      </div>
    </div>

    <form id="registration-form" class="registration-form requisition-form">
      <div class="requisition-layout">
        <div class="requisition-column">
          <section class="requisition-card">
            <h4 class="requisition-card-title title-dark">Facility Information</h4>
            <div class="field-grid one-col">
              <label><span>Reference Lab</span><input name="referenceLab" value="LabCenter Diagnostics" placeholder="Reference Lab"></label>
            </div>
            <div class="field-grid one-col">
              <label><span>Facility *</span>
                <select name="facilityName" id="req-facility-name" required>
                  ${buildFacilityAccountOptionMarkup(prefillData?.facilityName)}
                </select>
              </label>
            </div>
            <div class="field-grid two-col">
              <label><span>Provider *</span>
                <select name="provider" id="req-provider-name" required>
                  ${buildFacilityProviderOptionMarkup(prefillData?.provider, prefillData?.facilityName)}
                </select>
              </label>
              <label><span>Provider NPI</span><input name="providerNpi" id="req-provider-npi" placeholder="Provider NPI" readonly></label>
            </div>
          </section>

          <section class="requisition-card">
            <h4 class="requisition-card-title title-blue">Patient Information</h4>
            <div class="field-grid three-col">
              <label><span>First Name *</span><input name="firstName" placeholder="First Name" required></label>
              <label><span>Middle Name</span><input name="middleName" placeholder="Middle Name"></label>
              <label><span>Last Name *</span><input name="lastName" placeholder="Last Name" required></label>
            </div>
            <div class="field-grid four-col">
              <label><span>Suffix</span><input name="suffix" placeholder="Suffix"></label>
              <label><span>Patient DOB *</span><input type="date" name="dob" required></label>
              <label><span>Sex *</span>
                <select name="sex" required>
                  <option value="">Select Sex</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </label>
              <div><span class="field-label">Patient ID</span><p class="patient-id">Auto</p></div>
            </div>
            <div class="field-grid two-col">
              <label><span>Patient ID (MRN)</span><input name="mrn" placeholder="Enter Patient ID (MRN)"></label>
              <label><span>Contact Number</span><input name="phone" placeholder="(201) 555-0123"></label>
            </div>
            <div class="field-grid two-col">
              <label><span>Address 1 *</span><input name="address" placeholder="Address 1" required></label>
              <label><span>Address 2</span><input name="address2" placeholder="Address 2"></label>
            </div>
            <div class="field-grid three-col">
              <label><span>City</span><input name="city" placeholder="City"></label>
              <label><span>State</span><input name="state" placeholder="Select a State"></label>
              <label><span>Zip Code</span><input name="zipcode" placeholder="Zip Code"></label>
            </div>
            <div class="field-grid three-col">
              <label><span>County</span><input name="county" placeholder="County"></label>
              <label><span>Country</span><input name="country" value="United States of America" placeholder="Country"></label>
              <label><span>Email</span><input type="email" name="email" placeholder="Email"></label>
            </div>
            <div class="field-grid four-col">
              <label><span>Ethnicity</span><input name="ethnicity" placeholder="Select Ethnicity"></label>
              <label><span>Race</span><input name="race" placeholder="Select Race"></label>
              <label><span>Age</span><input type="text" name="age" placeholder="Age" readonly></label>
              <label><span>Phone Belongs To</span>
                <select name="phoneBelongsTo">
                  <option value="Patient">Patient</option>
                  <option value="Relative/Guardian">Relative/Guardian</option>
                </select>
              </label>
            </div>
          </section>
        </div>

        <div class="requisition-column">
          <section class="requisition-card">
            <h4 class="requisition-card-title title-purple">Specimen Information</h4>
            <div class="field-grid three-col">
              <label><span>Date Of Collection</span><input type="date" name="collectionDate"></label>
              <label><span>Time Of Collection</span><input type="time" name="collectionTime"></label>
              <label><span>Date Received</span><input type="date" name="receivedDate"></label>
            </div>
            <div class="field-grid one-col">
              <div class="specimen-type-block">
                <span class="field-label">Specimen Type</span>
                <div class="specimen-type-grid">
                  <label class="specimen-type-item">
                    <input type="checkbox" name="specimenTypeSwab" value="Swab">
                    <span class="allergy-mark" aria-hidden="true"></span>
                    <span>Swab</span>
                  </label>
                  <label class="specimen-type-item">
                    <input type="checkbox" id="specimen-type-wound" name="specimenTypeWound" value="Wound">
                    <span class="allergy-mark" aria-hidden="true"></span>
                    <span>Wound</span>
                  </label>
                  <label class="specimen-type-item">
                    <input type="checkbox" id="specimen-type-other" name="specimenTypeOther" value="Others">
                    <span class="allergy-mark" aria-hidden="true"></span>
                    <span>Others</span>
                  </label>
                </div>
                <label id="specimen-type-wound-wrap" class="hidden">
                  <span>Wound Location</span>
                  <input id="specimen-type-wound-text" name="specimenTypeWoundLocation" placeholder="Enter wound location">
                </label>
                <label id="specimen-type-other-wrap" class="hidden">
                  <span>Specify Others</span>
                  <input id="specimen-type-other-text" name="specimenTypeOtherText" placeholder="Enter specimen type">
                </label>
              </div>
            </div>
            <div class="field-grid one-col">
              <label><span>Additional Information</span><textarea name="additionalInformation" rows="3" placeholder="Additional specimen details"></textarea></label>
            </div>
          </section>

          <section class="requisition-card">
            <h4 class="requisition-card-title title-orange">Billing Information</h4>
            <div class="billing-options">
              <span>Please provide insurance type *</span>
              <div class="billing-option-list">
                <label class="billing-option-card">
                  <input type="radio" name="billingType" value="selfPay">
                  <span class="billing-mark" aria-hidden="true"></span>
                  <span class="billing-label">Self Pay</span>
                </label>
                <label class="billing-option-card">
                  <input type="radio" name="billingType" value="commercial">
                  <span class="billing-mark" aria-hidden="true"></span>
                  <span class="billing-label">Commercial</span>
                </label>
                <label class="billing-option-card">
                  <input type="radio" name="billingType" value="medicare">
                  <span class="billing-mark" aria-hidden="true"></span>
                  <span class="billing-label">Medicare</span>
                </label>
                <label class="billing-option-card">
                  <input type="radio" name="billingType" value="medicaid">
                  <span class="billing-mark" aria-hidden="true"></span>
                  <span class="billing-label">Medicaid</span>
                </label>
                <label class="billing-option-card">
                  <input type="radio" name="billingType" value="workersComp">
                  <span class="billing-mark" aria-hidden="true"></span>
                  <span class="billing-label">Workers Comp</span>
                </label>
                <label class="billing-option-card">
                  <input type="radio" name="billingType" value="clientBill">
                  <span class="billing-mark" aria-hidden="true"></span>
                  <span class="billing-label">Client Bill</span>
                </label>
                <label class="billing-option-card">
                  <input type="radio" name="billingType" value="uninsured">
                  <span class="billing-mark" aria-hidden="true"></span>
                  <span class="billing-label">Uninsured</span>
                </label>
              </div>
            </div>
            <div class="field-grid two-col">
              <label><span>Primary Insurance Provider</span><input name="primaryInsurance" placeholder="Primary Insurance Provider"></label>
              <label><span>Primary Policy ID *</span><input name="primaryMemberPolicy" placeholder="Primary Policy ID"></label>
            </div>
            <div class="field-grid two-col">
              <label><span>Primary Group ID</span><input name="primaryGroup" placeholder="Primary Group ID"></label>
              <label><span>Insurance Phone #</span><input name="insurancePhone" placeholder="Insurance Phone #"></label>
            </div>
            <div class="field-grid two-col">
              <label><span>Secondary Insurance</span><input name="secondaryInsurance" placeholder="Secondary Insurance"></label>
              <label><span>Secondary Policy ID</span><input name="secondaryMemberPolicy" placeholder="Secondary Policy ID"></label>
            </div>
            <div class="field-grid two-col">
              <label><span>Tertiary Insurance</span><input name="tertiaryInsurance" placeholder="Tertiary Insurance"></label>
              <label><span>Tertiary Policy ID</span><input name="tertiaryMemberPolicy" placeholder="Tertiary Policy ID"></label>
            </div>
            <div class="field-grid two-col">
              <label><span>Workers Compensation</span><input name="workersCompensation" placeholder="Workers Compensation"></label>
              <label><span>Member Policy</span><input name="workersMemberPolicy" placeholder="Member Policy"></label>
            </div>
            <div class="field-grid two-col">
              <label><span>Compensation Manager</span><input name="compensationManager" placeholder="Compensation Manager"></label>
              <label><span>Injury Date</span><input type="date" name="injuryDate"></label>
            </div>
          </section>

          <section class="requisition-card">
            <button
              type="button"
              class="requisition-card-title title-violet requisition-collapse-toggle"
              data-collapse-target="allergies"
              aria-expanded="false"
            >
              <span>Allergies</span>
              <span class="requisition-collapse-icon" aria-hidden="true">+</span>
            </button>
            <div class="requisition-collapsible-content is-collapsed" data-collapse-content="allergies">
              <div class="allergy-note">Select all that apply</div>
              <div class="allergy-grid">
              <label class="allergy-item"><input type="checkbox" name="allergy_amikacin"><span class="allergy-mark" aria-hidden="true"></span><span>Amikacin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_amoxicillin"><span class="allergy-mark" aria-hidden="true"></span><span>Amoxicillin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_azithromycin"><span class="allergy-mark" aria-hidden="true"></span><span>Azithromycin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_aztreonam"><span class="allergy-mark" aria-hidden="true"></span><span>Aztreonam</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_cefepime"><span class="allergy-mark" aria-hidden="true"></span><span>Cefepime</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_ceftazidime_avibactam"><span class="allergy-mark" aria-hidden="true"></span><span>Ceftazidime/avibactam</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_ceftriaxone"><span class="allergy-mark" aria-hidden="true"></span><span>Ceftriaxone</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_cephalexin"><span class="allergy-mark" aria-hidden="true"></span><span>Cephalexin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_clarithromycin"><span class="allergy-mark" aria-hidden="true"></span><span>Clarithromycin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_daptomycin"><span class="allergy-mark" aria-hidden="true"></span><span>Daptomycin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_erythromycin"><span class="allergy-mark" aria-hidden="true"></span><span>Erythromycin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_first_gen_cephalosporins"><span class="allergy-mark" aria-hidden="true"></span><span>First generation cephalosporins</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_fosfomycin"><span class="allergy-mark" aria-hidden="true"></span><span>Fosfomycin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_gentamicin"><span class="allergy-mark" aria-hidden="true"></span><span>Gentamicin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_imipenem"><span class="allergy-mark" aria-hidden="true"></span><span>Imipenem</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_levofloxacin"><span class="allergy-mark" aria-hidden="true"></span><span>Levofloxacin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_linezolid"><span class="allergy-mark" aria-hidden="true"></span><span>Linezolid</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_macrolides"><span class="allergy-mark" aria-hidden="true"></span><span>Macrolides</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_metronidazole"><span class="allergy-mark" aria-hidden="true"></span><span>Metronidazole</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_neomycin"><span class="allergy-mark" aria-hidden="true"></span><span>Neomycin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_nitrofurantoin"><span class="allergy-mark" aria-hidden="true"></span><span>Nitrofurantoin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_penicillin"><span class="allergy-mark" aria-hidden="true"></span><span>Penicillin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_polymyxins"><span class="allergy-mark" aria-hidden="true"></span><span>Polymyxins</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_rifampin"><span class="allergy-mark" aria-hidden="true"></span><span>Rifampin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_sulfonamides"><span class="allergy-mark" aria-hidden="true"></span><span>Sulfonamides</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_tetracyclines"><span class="allergy-mark" aria-hidden="true"></span><span>Tetracyclines</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_tigecycline"><span class="allergy-mark" aria-hidden="true"></span><span>Tigecycline</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_trimethoprim"><span class="allergy-mark" aria-hidden="true"></span><span>Trimethoprim</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_vancomycin"><span class="allergy-mark" aria-hidden="true"></span><span>Vancomycin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_aminoglycosides"><span class="allergy-mark" aria-hidden="true"></span><span>Aminoglycosides</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_amoxicillin_clavulanate"><span class="allergy-mark" aria-hidden="true"></span><span>Amoxicillin/clavulanate</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_azoles"><span class="allergy-mark" aria-hidden="true"></span><span>Azoles</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_carbapenems"><span class="allergy-mark" aria-hidden="true"></span><span>Carbapenems</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_ceftazidime"><span class="allergy-mark" aria-hidden="true"></span><span>Ceftazidime</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_ceftolozane_tazobactam"><span class="allergy-mark" aria-hidden="true"></span><span>Ceftolozane/tazobactam</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_cefuroxime"><span class="allergy-mark" aria-hidden="true"></span><span>Cefuroxime</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_ciprofloxacin"><span class="allergy-mark" aria-hidden="true"></span><span>Ciprofloxacin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_clindamycin"><span class="allergy-mark" aria-hidden="true"></span><span>Clindamycin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_doxycycline"><span class="allergy-mark" aria-hidden="true"></span><span>Doxycycline</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_fifth_gen_cephalosporins"><span class="allergy-mark" aria-hidden="true"></span><span>Fifth generation cephalosporins</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_fluconazole"><span class="allergy-mark" aria-hidden="true"></span><span>Fluconazole</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_fourth_gen_cephalosporins"><span class="allergy-mark" aria-hidden="true"></span><span>Fourth generation cephalosporins</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_glycopeptides"><span class="allergy-mark" aria-hidden="true"></span><span>Glycopeptides</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_imipenem_cilastatin"><span class="allergy-mark" aria-hidden="true"></span><span>Imipenem/cilastatin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_lincosamides"><span class="allergy-mark" aria-hidden="true"></span><span>Lincosamides</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_lipopeptides"><span class="allergy-mark" aria-hidden="true"></span><span>Lipopeptides</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_meropenem"><span class="allergy-mark" aria-hidden="true"></span><span>Meropenem</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_moxifloxacin"><span class="allergy-mark" aria-hidden="true"></span><span>Moxifloxacin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_nitrofurans"><span class="allergy-mark" aria-hidden="true"></span><span>Nitrofurans</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_oxazolidinones"><span class="allergy-mark" aria-hidden="true"></span><span>Oxazolidinones</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_piperacillin_tazobactam"><span class="allergy-mark" aria-hidden="true"></span><span>Piperacillin/tazobactam</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_quinolones"><span class="allergy-mark" aria-hidden="true"></span><span>Quinolones</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_second_gen_cephalosporins"><span class="allergy-mark" aria-hidden="true"></span><span>Second generation cephalosporins</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_tetracycline"><span class="allergy-mark" aria-hidden="true"></span><span>Tetracycline</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_third_gen_cephalosporins"><span class="allergy-mark" aria-hidden="true"></span><span>Third generation cephalosporins</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_tobramycin"><span class="allergy-mark" aria-hidden="true"></span><span>Tobramycin</span></label>
              <label class="allergy-item"><input type="checkbox" name="allergy_trimethoprim_sulfamethoxazole"><span class="allergy-mark" aria-hidden="true"></span><span>Trimethoprim/sulfamethoxazole</span></label>
              </div>
              <div class="allergy-add-row">
                <input type="text" id="custom-allergy-input" class="allergy-add-input" placeholder="Enter allergy not listed">
                <button type="button" id="add-custom-allergy" class="allergy-add-btn">Add</button>
              </div>
              <input type="hidden" id="allergy-custom-list" name="allergyCustomList">
            </div>
          </section>
        </div>
      </div>

      <div class="form-actions requisition-actions">
        <button type="button" id="registration-clear" class="btn-ghost">Clear</button>
        <div class="action-right">
          <button type="submit" class="btn-primary dark-submit">Save Requisition</button>
          <button type="button" id="register-and-order" class="btn-primary dark-submit ghost-submit">Register And Order</button>
        </div>
      </div>
    </form>
    <p id="registration-status" class="subtle"></p>
  `;

  const form = document.getElementById("registration-form");
  const clearBtn = document.getElementById("registration-clear");
  const status = document.getElementById("registration-status");
  const registerAndOrderBtn = document.getElementById("register-and-order");
  const facilityNameSelect = document.getElementById("req-facility-name");
  const providerNameSelect = document.getElementById("req-provider-name");
  const providerNpiInput = document.getElementById("req-provider-npi");
  const searchInput = document.getElementById("patient-search");
  const searchClear = document.getElementById("search-clear");
  const searchResults = document.getElementById("search-results");
  const patientIdNode = panelBody.querySelector(".patient-id");
  const allergyGrid = form.querySelector(".allergy-grid");
  const customAllergyInput = document.getElementById("custom-allergy-input");
  const addCustomAllergyBtn = document.getElementById("add-custom-allergy");
  const customAllergyListInput = document.getElementById("allergy-custom-list");
  const specimenTypeWoundCheckbox = document.getElementById("specimen-type-wound");
  const specimenTypeWoundWrap = document.getElementById("specimen-type-wound-wrap");
  const specimenTypeWoundText = document.getElementById("specimen-type-wound-text");
  const specimenTypeOtherCheckbox = document.getElementById("specimen-type-other");
  const specimenTypeOtherWrap = document.getElementById("specimen-type-other-wrap");
  const specimenTypeOtherText = document.getElementById("specimen-type-other-text");
  const requisitionScanFileInput = document.getElementById("requisition-scan-file");
  const requisitionScanTrigger = document.getElementById("requisition-scan-trigger");
  const sectionCollapseToggles = Array.from(form.querySelectorAll("[data-collapse-target]"));
  const allPatients = getSearchablePatients();
  let activeResults = [];
  let selectedIndex = -1;

  attachRequisitionTabEvents();

  sectionCollapseToggles.forEach((toggleButton) => {
    toggleButton.addEventListener("click", () => {
      const target = toggleButton.getAttribute("data-collapse-target");
      if (!target) return;
      const collapsibleContent = form.querySelector(`[data-collapse-content="${target}"]`);
      if (!collapsibleContent) return;

      const isCollapsed = collapsibleContent.classList.toggle("is-collapsed");
      toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
      const iconNode = toggleButton.querySelector(".requisition-collapse-icon");
      if (iconNode) iconNode.textContent = isCollapsed ? "+" : "-";
    });
  });

  function syncSpecimenTypeDependentFields() {
    const showWound = Boolean(specimenTypeWoundCheckbox?.checked);
    specimenTypeWoundWrap?.classList.toggle("hidden", !showWound);
    if (specimenTypeWoundText) {
      specimenTypeWoundText.disabled = !showWound;
      specimenTypeWoundText.required = showWound;
      if (!showWound) specimenTypeWoundText.value = "";
    }

    const showOther = Boolean(specimenTypeOtherCheckbox?.checked);
    specimenTypeOtherWrap?.classList.toggle("hidden", !showOther);
    if (specimenTypeOtherText) {
      specimenTypeOtherText.disabled = !showOther;
      specimenTypeOtherText.required = showOther;
      if (!showOther) specimenTypeOtherText.value = "";
    }
  }

  function syncCustomAllergyList() {
    if (!allergyGrid || !customAllergyListInput) return;
    const entries = [...allergyGrid.querySelectorAll(".allergy-item[data-custom-allergy] input[type='checkbox']:checked")]
      .map((input) => input.value.trim())
      .filter(Boolean);
    customAllergyListInput.value = entries.join(", ");
  }

  function clearCustomAllergies() {
    if (!allergyGrid) return;
    allergyGrid.querySelectorAll(".allergy-item[data-custom-allergy]").forEach((node) => node.remove());
    syncCustomAllergyList();
  }

  function buildCustomAllergyFieldName(allergyLabel) {
    const slug = allergyLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const baseName = slug ? `allergy_custom_${slug}` : "allergy_custom";
    let fieldName = baseName;
    let count = 2;
    while (form.elements[fieldName]) {
      fieldName = `${baseName}_${count}`;
      count += 1;
    }
    return fieldName;
  }

  function addCustomAllergy() {
    if (!allergyGrid || !customAllergyInput) return;
    const rawValue = customAllergyInput.value.trim();
    if (!rawValue) return;

    const normalized = rawValue.toLowerCase();
    const matchingLabel = [...allergyGrid.querySelectorAll(".allergy-item span:last-child")]
      .find((node) => (node.textContent || "").trim().toLowerCase() === normalized);
    if (matchingLabel) {
      const checkbox = matchingLabel.closest(".allergy-item")?.querySelector("input[type='checkbox']");
      if (checkbox) checkbox.checked = true;
      customAllergyInput.value = "";
      return;
    }

    const fieldName = buildCustomAllergyFieldName(rawValue);
    const item = document.createElement("label");
    item.className = "allergy-item";
    item.dataset.customAllergy = "true";
    item.innerHTML = `<input type="checkbox" name="${fieldName}" value="${rawValue}" checked><span class="allergy-mark" aria-hidden="true"></span><span>${rawValue}</span>`;
    allergyGrid.appendChild(item);
    customAllergyInput.value = "";
    syncCustomAllergyList();
  }

  addCustomAllergyBtn?.addEventListener("click", addCustomAllergy);
  allergyGrid?.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.closest(".allergy-item[data-custom-allergy]")) {
      syncCustomAllergyList();
    }
  });
  customAllergyInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addCustomAllergy();
  });
  specimenTypeWoundCheckbox?.addEventListener("change", syncSpecimenTypeDependentFields);
  specimenTypeOtherCheckbox?.addEventListener("change", syncSpecimenTypeDependentFields);
  syncSpecimenTypeDependentFields();

  function refreshPatientIdPreview() {
    const values = Object.fromEntries(new FormData(form).entries());
    patientIdNode.textContent = resolvePatientId(values, patientIdNode.textContent);
  }

  function applyFormData(values) {
    const normalizedValues = {
      ...values,
    };
    if (normalizedValues.specimenTypeWoundLocation && !normalizedValues.specimenTypeWound) {
      normalizedValues.specimenTypeWound = "Wound";
    }
    if (normalizedValues.specimenTypeOtherText && !normalizedValues.specimenTypeOther) {
      normalizedValues.specimenTypeOther = "Others";
    }

    const map = {
      referenceLab: normalizedValues.referenceLab || "LabCenter Diagnostics",
      facilityName: normalizedValues.facilityName,
      provider: normalizedValues.provider,
      providerNpi: normalizedValues.providerNpi || "",
      mrn: normalizedValues.mrn,
      firstName: normalizedValues.firstName,
      middleName: normalizedValues.middleName,
      lastName: normalizedValues.lastName,
      suffix: normalizedValues.suffix || "",
      sex: normalizedValues.sex,
      phoneBelongsTo: normalizedValues.phoneBelongsTo || "Patient",
      dob: normalizedValues.dob,
      age: normalizedValues.age || calcAgeInYearsAndMonths(normalizedValues.dob),
      phone: normalizedValues.phone,
      email: normalizedValues.email,
      state: normalizedValues.state,
      address: normalizedValues.address,
      address2: normalizedValues.address2,
      city: normalizedValues.city,
      zipcode: normalizedValues.zipcode,
      county: normalizedValues.county,
      ethnicity: normalizedValues.ethnicity,
      country: normalizedValues.country || "United States of America",
      race: normalizedValues.race,
      collectionDate: normalizedValues.collectionDate,
      collectionTime: normalizedValues.collectionTime,
      receivedDate: normalizedValues.receivedDate,
      additionalInformation: normalizedValues.additionalInformation,
      primaryInsurance: normalizedValues.primaryInsurance,
      primaryMemberPolicy: normalizedValues.primaryMemberPolicy,
      primaryGroup: normalizedValues.primaryGroup,
      primaryGroupNo: normalizedValues.primaryGroupNo,
      primaryAttachments: normalizedValues.primaryAttachments,
      insurancePhone: normalizedValues.insurancePhone,
      secondaryInsurance: normalizedValues.secondaryInsurance,
      secondaryMemberPolicy: normalizedValues.secondaryMemberPolicy,
      secondaryGroup: normalizedValues.secondaryGroup,
      secondaryGroupNo: normalizedValues.secondaryGroupNo,
      secondaryAttachments: normalizedValues.secondaryAttachments,
      tertiaryInsurance: normalizedValues.tertiaryInsurance,
      tertiaryMemberPolicy: normalizedValues.tertiaryMemberPolicy,
      tertiaryGroup: normalizedValues.tertiaryGroup,
      tertiaryGroupNo: normalizedValues.tertiaryGroupNo,
      tertiaryAttachments: normalizedValues.tertiaryAttachments,
      workersCompensation: normalizedValues.workersCompensation,
      workersMemberPolicy: normalizedValues.workersMemberPolicy,
      compensationManager: normalizedValues.compensationManager,
      injuryDate: normalizedValues.injuryDate,
    };

    Object.entries(map).forEach(([key, value]) => {
      if (form.elements[key] && value !== undefined) form.elements[key].value = value || "";
    });
    const nextFacility = String(normalizedValues.facilityName || "").trim();
    const nextProvider = String(normalizedValues.provider || "").trim();
    if (facilityNameSelect) {
      if (nextFacility && !Array.from(facilityNameSelect.options).some((opt) => opt.value === nextFacility)) {
        facilityNameSelect.insertAdjacentHTML(
          "beforeend",
          `<option value="${escapeHtml(nextFacility)}">${escapeHtml(nextFacility)}</option>`
        );
      }
      facilityNameSelect.value = nextFacility;
    }
    const matchedProvider = refreshProviderSelectOptions(nextFacility, nextProvider);
    if (!matchedProvider && providerNpiInput) providerNpiInput.value = "";
    if (matchedProvider && normalizedValues.providerNpi && providerNpiInput) providerNpiInput.value = normalizedValues.providerNpi;

    const billingTypeInputs = Array.from(form.querySelectorAll('input[name="billingType"]'));
    if ("billingType" in normalizedValues && billingTypeInputs.length) {
      billingTypeInputs.forEach((input) => {
        input.checked = input.value === normalizedValues.billingType;
      });
    }

    const checkboxMappings = [
      ["specimenTypeSwab", "Swab"],
      ["specimenTypeWound", "Wound"],
      ["specimenTypeOther", "Others"],
    ];
    checkboxMappings.forEach(([fieldName, checkedValue]) => {
      const input = form.elements[fieldName];
      const rawValue = normalizedValues[fieldName];
      if (!(input instanceof HTMLInputElement) || rawValue === undefined) return;
      input.checked = rawValue === true || rawValue === "true" || rawValue === checkedValue || rawValue === input.value;
    });
    syncSpecimenTypeDependentFields();
    if (specimenTypeWoundText && normalizedValues.specimenTypeWoundLocation !== undefined) {
      specimenTypeWoundText.value = normalizedValues.specimenTypeWoundLocation || "";
    }
    if (specimenTypeOtherText && normalizedValues.specimenTypeOtherText !== undefined) {
      specimenTypeOtherText.value = normalizedValues.specimenTypeOtherText || "";
    }

    if (normalizedValues.patientId) patientIdNode.textContent = normalizedValues.patientId;
  }

  function syncAgeFromDob() {
    const dobField = form.elements.dob;
    const ageField = form.elements.age;
    if (!dobField || !ageField) return;
    ageField.value = calcAgeInYearsAndMonths(dobField.value);
  }

  function normalizeZip(raw) {
    return String(raw || "").replace(/\D/g, "").slice(0, 5);
  }

  function syncProviderNpiFromSelection() {
    if (!providerNameSelect || !providerNpiInput) return;
    const selectedOption = providerNameSelect.options[providerNameSelect.selectedIndex];
    const selectedNpi = selectedOption?.getAttribute("data-provider-npi") || "";
    providerNpiInput.value = selectedNpi;
  }

  function syncProviderSelectDisplayText() {
    if (!providerNameSelect) return;
    const selectedValue = providerNameSelect.value;
    Array.from(providerNameSelect.options).forEach((option) => {
      const fullLabel = option.getAttribute("data-provider-label");
      const providerName = option.getAttribute("data-provider-name");
      if (!fullLabel || !providerName) return;
      option.textContent = option.value === selectedValue ? providerName : fullLabel;
    });
  }

  function refreshProviderSelectOptions(selectedFacility = "", preferredProvider = "") {
    if (!providerNameSelect) return false;
    const nextFacility = String(selectedFacility || "").trim();
    const nextProvider = String(preferredProvider || "").trim();
    providerNameSelect.innerHTML = buildFacilityProviderOptionMarkup(nextProvider, nextFacility);
    const hasMatchingProvider = Array.from(providerNameSelect.options).some((option) => option.value === nextProvider);
    providerNameSelect.value = hasMatchingProvider ? nextProvider : "";
    syncProviderNpiFromSelection();
    syncProviderSelectDisplayText();
    return hasMatchingProvider;
  }

  function tryAutoFillFromZip() {
    const zipcodeInput = form.elements.zipcode;
    if (!zipcodeInput) return;
    const zip = normalizeZip(zipcodeInput.value);
    if (zip.length !== 5) return;

    const location = zipCodeDirectory[zip];
    if (!location) return;

    if (form.elements.city) form.elements.city.value = location.city;
    if (form.elements.state) form.elements.state.value = location.state;
    if (form.elements.country) form.elements.country.value = location.country;
  }

  function applyPatientToForm(patient) {
    const values = asPatientRecord(patient);
    applyFormData(values);
    patientIdNode.textContent = values.patientId || resolvePatientId(values, patientIdNode.textContent);
    status.textContent = `Loaded patient ${values.firstName} ${values.lastName}`.trim();
  }

  async function handleRequisitionScanUpload(file) {
    if (!file) return;
    if (requisitionScanTrigger) requisitionScanTrigger.disabled = true;
    status.textContent = `Reading scan copy ${file.name}...`;

    try {
      const payload = await requestRequisitionScanAutofill(file);
      const nextValues = payload?.values || {};
      const matchedCount = Array.isArray(payload?.matchedFields)
        ? payload.matchedFields.length
        : Object.keys(nextValues).length;

      if (!matchedCount) {
        status.textContent = payload?.message || "No recognizable requisition fields were found in the scan.";
        return;
      }

      applyFormData(nextValues);
      syncAgeFromDob();
      tryAutoFillFromZip();
      refreshPatientIdPreview();
      status.textContent = `${file.name} processed. Filled ${matchedCount} field${matchedCount === 1 ? "" : "s"}. Review the form before saving.`;
    } catch (error) {
      status.textContent = error?.message || "Unable to read the uploaded scan copy.";
    } finally {
      if (requisitionScanTrigger) requisitionScanTrigger.disabled = false;
      if (requisitionScanFileInput) requisitionScanFileInput.value = "";
    }
  }

  function renderSearchResults(results, query) {
    if (!query || !results.length) {
      searchResults.classList.add("hidden");
      searchResults.innerHTML = "";
      return;
    }

    const q = query.toLowerCase();
    const html = results
      .slice(0, 10)
      .map((patient, index) => {
        const name = `${patient.firstName || ""} ${patient.middleName || ""} ${patient.lastName || ""}`.replace(/\s+/g, " ").trim();
        const age = calcAge(patient.dob);
        const sex = (patient.sex || "U").charAt(0).toUpperCase();
        const patientLine = `${name} (${age || "-"}Y-${sex || "-"})`;
        const escapedQuery = escapeForRegExp(q);
        const highlightedLine = escapedQuery
          ? patientLine.replace(new RegExp(escapedQuery, "ig"), (match) => `<mark>${match}</mark>`)
          : patientLine;
        return `
          <button type="button" class="search-item ${index === selectedIndex ? "active" : ""}" data-index="${index}">
            <div class="search-item-row">
              <strong>#${patient.patientId || "N/A"}</strong>
              <span>Patient Due: $ 1</span>
            </div>
            <div class="search-item-name">${highlightedLine}</div>
            <div class="search-item-row">
              <span>DOB: ${formatDateForCard(patient.dob)}</span>
              <span>${patient.provider || "Provider Not Set"}</span>
            </div>
            <div class="search-item-row">
              <span>${patient.phone || "No Contact"}</span>
              <span>Registered On: ${formatDateForCard(patient.createdAt || patient.dob)}</span>
            </div>
          </button>
        `;
      })
      .join("");

    searchResults.innerHTML = `
      <div class="search-results-header">Patients <span>${Math.min(results.length, 10)}</span></div>
      ${html}
    `;
    searchResults.classList.remove("hidden");
  }

  function findPatients(query) {
    const value = query.trim().toLowerCase();
    if (!value) return [];
    return allPatients.filter((patient) => {
      const blob = [
        patient.firstName,
        patient.middleName,
        patient.lastName,
        patient.phone,
        patient.patientId,
        patient.mrn,
        patient.dob,
        patient.email,
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(value);
    });
  }

  function runSearch() {
    activeResults = findPatients(searchInput.value);
    selectedIndex = activeResults.length ? 0 : -1;
    renderSearchResults(activeResults, searchInput.value);
  }

  function selectActiveResult() {
    if (selectedIndex < 0 || !activeResults[selectedIndex]) return;
    const selected = activeResults[selectedIndex];
    applyPatientToForm(selected);
    searchInput.value = `${selected.firstName || ""} ${selected.lastName || ""}`.trim();
    searchResults.classList.add("hidden");
  }

  searchInput.addEventListener("input", runSearch);
  searchInput.addEventListener("keydown", (event) => {
    if (!activeResults.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, activeResults.length - 1);
      renderSearchResults(activeResults, searchInput.value);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      renderSearchResults(activeResults, searchInput.value);
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectActiveResult();
    } else if (event.key === "Escape") {
      searchResults.classList.add("hidden");
    }
  });

  searchResults.addEventListener("click", (event) => {
    const button = event.target.closest(".search-item");
    if (!button) return;
    const index = Number(button.dataset.index);
    if (!Number.isInteger(index) || !activeResults[index]) return;
    selectedIndex = index;
    selectActiveResult();
  });

  searchResults.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    activeResults = [];
    selectedIndex = -1;
    searchResults.classList.add("hidden");
    searchInput.focus();
  });

  searchInput.addEventListener("blur", () => {
    window.setTimeout(() => searchResults.classList.add("hidden"), 100);
  });
  currentSearchInput = searchInput;

  requisitionScanTrigger?.addEventListener("click", () => {
    requisitionScanFileInput?.click();
  });
  requisitionScanFileInput?.addEventListener("change", () => {
    const file = requisitionScanFileInput.files?.[0];
    if (!file) return;
    handleRequisitionScanUpload(file);
  });

  if (form.elements.zipcode) {
    form.elements.zipcode.addEventListener("input", tryAutoFillFromZip);
    form.elements.zipcode.addEventListener("blur", tryAutoFillFromZip);
  }

  loadZipCodeDirectory().then(() => {
    tryAutoFillFromZip();
  });

  if (prefillData) {
    applyFormData(prefillData);
  }
  syncAgeFromDob();

  const refreshFacilitySelectOptions = () => {
    const currentFacilityValue = facilityNameSelect ? facilityNameSelect.value : "";
    if (facilityNameSelect) {
      facilityNameSelect.innerHTML = buildFacilityAccountOptionMarkup(currentFacilityValue);
      if (currentFacilityValue) facilityNameSelect.value = currentFacilityValue;
    }
    const currentProviderValue = providerNameSelect ? providerNameSelect.value : "";
    refreshProviderSelectOptions(currentFacilityValue, currentProviderValue);
  };

  facilityNameSelect?.addEventListener("change", () => {
    refreshProviderSelectOptions(facilityNameSelect.value, providerNameSelect?.value || "");
  });
  providerNameSelect?.addEventListener("change", () => {
    syncProviderNpiFromSelection();
    syncProviderSelectDisplayText();
  });
  refreshProviderSelectOptions(facilityNameSelect?.value || "", providerNameSelect?.value || "");

  if (facilityDataLoaded) {
    refreshFacilitySelectOptions();
  } else {
    loadFacilityData()
      .then(() => {
        if (currentView !== "registration" || requisitionSubtab !== "create") return;
        refreshFacilitySelectOptions();
      })
      .catch(() => {});
  }

  refreshPatientIdPreview();

  ["firstName", "lastName", "dob", "phone", "mrn"].forEach((fieldName) => {
    const field = form.elements[fieldName];
    if (!field) return;
    field.addEventListener("input", refreshPatientIdPreview);
    field.addEventListener("change", refreshPatientIdPreview);
  });
  if (form.elements.dob) {
    form.elements.dob.addEventListener("input", syncAgeFromDob);
    form.elements.dob.addEventListener("change", syncAgeFromDob);
  }

  clearBtn.addEventListener("click", () => {
    form.reset();
    clearCustomAllergies();
    syncSpecimenTypeDependentFields();
    syncAgeFromDob();
    refreshFacilitySelectOptions();
    refreshPatientIdPreview();
    status.textContent = "Form cleared.";
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    data.patientId = resolvePatientId(data, patientIdNode.textContent.trim());
    patientIdNode.textContent = data.patientId;
    const count = saveRegistrationData(data);
    status.textContent = `Requisition saved for Patient ID ${data.patientId}. Total records: ${count}`;
    form.reset();
    clearCustomAllergies();
    syncSpecimenTypeDependentFields();
    syncAgeFromDob();
    refreshFacilitySelectOptions();
    refreshPatientIdPreview();
  });

  registerAndOrderBtn.addEventListener("click", () => {
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form).entries());
    data.patientId = resolvePatientId(data, patientIdNode.textContent.trim());
    patientIdNode.textContent = data.patientId;
    const count = saveRegistrationData(data);
    status.textContent = `Requisition saved for Patient ID ${data.patientId}. Total records: ${count}`;
    renderOrderPatient(data);
  });
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
  `;

  function backToRegistration() {
    requisitionSubtab = "create";
    renderRegistration(patient);
  }

  const selectedIcdSummary = document.getElementById("selected-icd-summary");
  const orderPageNode = panelBody.querySelector(".order-page");
  const orderServiceRowsNode = document.getElementById("order-service-rows");
  const addServiceBtn = document.getElementById("order-add-service");
  const icdLookup = new Map(icdCatalog.map((item) => [item.code, item]));
  const orderState = {
    rows: [],
    openPicker: null,
  };

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

  function getAvailableIcdsForRow(row) {
    const codes = new Set();
    orderPanelCatalog
      .filter((panel) => row.panels.has(panel.id))
      .forEach((panel) => {
      panel.icdCodes.forEach((code) => codes.add(code));
    });
    return Array.from(codes)
      .map((code) => icdLookup.get(code))
      .filter(Boolean)
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  function updateRowComputedValues(row) {
    const panelItems = orderPanelCatalog.filter((panel) => row.panels.has(panel.id));
    row.price = panelItems.reduce((sum, panel) => sum + panel.price, 0);
  }

  function updateOrderSummary() {
    const allIcds = new Set();
    orderState.rows.forEach((row) => row.icds.forEach((code) => allIcds.add(code)));
    selectedIcdSummary.value = Array.from(allIcds).sort().join(", ");
  }

  function pruneIcdSelectionForRow(row) {
    const allowed = new Set(getAvailableIcdsForRow(row).map((item) => item.code));
    Array.from(row.icds).forEach((code) => {
      if (!allowed.has(code)) row.icds.delete(code);
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
    if (!rows.length) return `<p class="picker-empty">Select at least one panel first.</p>`;

    const q = row.icdQuery.trim().toLowerCase();
    const filtered = rows.filter((item) => `${item.code} ${item.description}`.toLowerCase().includes(q));
    if (!filtered.length) return `<p class="picker-empty">No matching ICD codes.</p>`;

    return filtered
      .map((icd) => {
        const checked = row.icds.has(icd.code) ? "checked" : "";
        return `
          <label class="picker-option">
            <input type="checkbox" data-row-id="${row.id}" data-icd-code="${icd.code}" ${checked}>
            <div class="picker-option-text">
              <strong>${icd.code}</strong>
              <p>${icd.description}</p>
            </div>
          </label>
        `;
      })
      .join("");
  }

  function renderServiceRows() {
    orderServiceRowsNode.innerHTML = orderState.rows
      .map((row, index) => {
        updateRowComputedValues(row);
        const panelNames = orderPanelCatalog
          .filter((panel) => row.panels.has(panel.id))
          .map((panel) => panel.name)
          .join(", ");
        const icdCodes = Array.from(row.icds).sort().join(", ");
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
                  <input data-row-id="${row.id}" data-picker-search="icd" placeholder="Search ICD code or description" value="${row.icdQuery}">
                </div>
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

  function commitOrder() {
    const sampleCollectTime = document.getElementById("sample-collect-time")?.value || "";
    const orderBookingTime = document.getElementById("order-booking-time")?.value || "";
    const preparedRows = orderState.rows
      .map((row, index) => {
        const panelItems = orderPanelCatalog.filter((panel) => row.panels.has(panel.id));
        const serviceName = panelItems.map((panel) => panel.name).join(", ");
        const icdCodes = Array.from(row.icds).sort();
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

    // Each service row becomes an independent order history record.
    preparedRows.forEach((serviceRow) => {
      const orderId = getNextOrderId();
      const createdAt = new Date().toISOString();
      const orderRecord = {
        orderId,
        accessionNo: buildAccessionNumber({
          serviceLine: serviceRow,
          orderDate: sampleCollectTime || createdAt,
          orderId,
        }),
        ...commonFields,
        services: [serviceRow],
        amount: serviceRow.price,
        concession: serviceRow.concession,
        due: serviceRow.due,
        createdAt,
      };
      saveOrderRecord(orderRecord);
    });

    currentView = "order-history";
    renderNav();
    renderView();
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
      return;
    }

    const displayField = event.target.closest(".service-name-field, .service-icd-field");
    if (displayField) {
      const rowId = Number(displayField.getAttribute("data-row-id"));
      const type = displayField.classList.contains("service-name-field") ? "panel" : "icd";
      orderState.openPicker = { rowId, type };
      renderServiceRows();
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
  });

  orderServiceRowsNode.addEventListener("input", (event) => {
    const rowId = Number(event.target.getAttribute("data-row-id"));
    const row = orderState.rows.find((item) => item.id === rowId);
    if (!row) return;

    if (event.target.matches("[data-picker-search='panel']")) {
      row.panelQuery = event.target.value;
      renderServiceRows();
      return;
    }
    if (event.target.matches("[data-picker-search='icd']")) {
      row.icdQuery = event.target.value;
      renderServiceRows();
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

      <div id="patient-search-results" class="patient-search-results hidden"></div>
    </section>
  `;

  const allPatients = getSearchablePatients();
  const searchBtn = document.getElementById("patient-search-btn");
  const moreBtn = document.getElementById("patient-search-more");
  const morePanel = document.getElementById("patient-search-more-panel");
  const resultsNode = document.getElementById("patient-search-results");
  let baseResults = [];
  let sortField = "patientId";
  let sortDirection = "asc";
  let activeFilterField = "";
  let textFilterMenuOpen = false;
  let draft = null;
  let valueCache = [];
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
      resultsNode.classList.remove("hidden");
      resultsNode.innerHTML = `<p class="subtle table-empty">No patients found.</p>`;
      return;
    }

    const processed = getFilteredSortedRows();
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
          </tr>
        </thead>
        <tbody>
          ${processed
            .slice(0, 50)
            .map((patient) => {
              const fullName = getName(patient);
              return `
                <tr>
                  <td>${patient.patientId || "-"}</td>
                  <td>${fullName || "-"}</td>
                  <td>${patient.phone || "-"}</td>
                  <td>${formatDateForCard(patient.dob)}</td>
                  <td>${patient.mrn || "-"}</td>
                  <td>${patient.provider || "-"}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
      <div class="table-meta">${processed.length} result(s)</div>
      <div id="column-filter-popover" class="column-filter-popover hidden"></div>
    `;

    if (activeFilterField) {
      rerenderPopover();
    }

    resultsNode.onclick = (event) => {
      const sortButton = event.target.closest(".sort-btn");
      if (sortButton) {
        const field = sortButton.dataset.field;
        if (!field) return;
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
        const field = filterButton.dataset.field;
        if (!field) return;
        if (activeFilterField === field) {
          activeFilterField = "";
          const pop = resultsNode.querySelector("#column-filter-popover");
          if (pop) pop.classList.add("hidden");
          draft = null;
          return;
        }
        draft = null;
        openFilterPopover(field, filterButton);
        return;
      }

      if (event.target.closest("[data-sort]")) {
        const dir = event.target.getAttribute("data-sort");
        if (!activeFilterField || !dir) return;
        sortField = activeFilterField;
        sortDirection = dir === "desc" ? "desc" : "asc";
        activeFilterField = "";
        draft = null;
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
        activeFilterField = "";
        draft = null;
        renderResultsTable();
        return;
      }

      if (event.target.closest("[data-filter-cancel]")) {
        activeFilterField = "";
        draft = null;
        const pop = resultsNode.querySelector("#column-filter-popover");
        if (pop) pop.classList.add("hidden");
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
        const pop = resultsNode.querySelector("#column-filter-popover");
        if (pop) pop.classList.add("hidden");
        activeFilterField = "";
        draft = null;
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
    </section>
  `;

  const tabButtons = Array.from(panelBody.querySelectorAll("[data-mr-tab]"));
  const toolbarHostNode = document.getElementById("mr-toolbar");
  const feedbackNode = document.getElementById("mr-feedback");
  const editorNode = document.getElementById("mr-editor");
  const summaryNode = document.getElementById("mr-summary");
  const headNode = document.getElementById("mr-table-head");
  const bodyNode = document.getElementById("mr-table-body");

  let activeTab = "organisms";
  let editorMode = "";
  const tabState = {
    organisms: { query: "", type: "", status: "" },
    genes: { query: "", resistanceClass: "" },
    icd: { query: "", panel: "" },
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
          <input name="code" required placeholder="e.g. A49.9">
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
    const query = tabState.icd.query.trim().toLowerCase();
    const selectedPanel = tabState.icd.panel;

    const rows = icdCatalog
      .map((item) => {
        const code = String(item.code || "").trim();
        const description = String(item.description || "").trim();
        const mappedPanels = orderPanelCatalog
          .filter((panel) => Array.isArray(panel.icdCodes) && panel.icdCodes.includes(code))
          .map((panel) => panel.name)
          .sort((a, b) => a.localeCompare(b));
        return { code, description, panels: mappedPanels };
      })
      .filter((row) => {
        if (selectedPanel && !row.panels.includes(selectedPanel)) return false;
        if (!query) return true;
        return `${row.code} ${row.description} ${row.panels.join(" ")}`.toLowerCase().includes(query);
      })
      .sort((a, b) => a.code.localeCompare(b.code));

    const mappedCount = rows.filter((row) => row.panels.length > 0).length;
    const uniquePanels = new Set(rows.flatMap((row) => row.panels)).size;

    setTableHead(["ICD Code", "Description", "Panels", "Panel Count"]);
    summaryNode.innerHTML = `
      <div class="mr-stat"><strong>${rows.length}</strong><span>codes</span></div>
      <div class="mr-stat"><strong>${mappedCount}</strong><span>mapped codes</span></div>
      <div class="mr-stat"><strong>${uniquePanels}</strong><span>linked panels</span></div>
    `;

    if (!rows.length) {
      bodyNode.innerHTML = `<tr><td colspan="4" class="table-empty">No ICD codes found.</td></tr>`;
      return;
    }

    bodyNode.innerHTML = rows
      .map((row) => `
        <tr>
          <td class="mono">${escapeHtml(row.code)}</td>
          <td>${escapeHtml(row.description || "-")}</td>
          <td>${escapeHtml(row.panels.length ? row.panels.join(", ") : "-")}</td>
          <td>${row.panels.length}</td>
        </tr>
      `)
      .join("");
  }

  function renderRows() {
    if (activeTab === "organisms") {
      renderOrganismRows();
      return;
    }
    if (activeTab === "antibiotic-genes") {
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
        <div class="master-registry-toolbar mr-toolbar-two">
          <label class="mr-field mr-wide">
            <span>Search ICD Codes</span>
            <input id="mr-icd-search" placeholder="Search ICD code, description, or panel">
          </label>
          <label class="mr-field">
            <span>Panel</span>
            <select id="mr-icd-panel">
              <option value="">All</option>
              ${panelNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}
            </select>
          </label>
        </div>
      `, "Add ICD Code");

      const searchInput = document.getElementById("mr-icd-search");
      const panelInput = document.getElementById("mr-icd-panel");
      searchInput.value = tabState.icd.query;
      panelInput.value = tabState.icd.panel;

      searchInput.addEventListener("input", () => {
        tabState.icd.query = searchInput.value;
        renderRows();
      });
      panelInput.addEventListener("change", () => {
        tabState.icd.panel = panelInput.value;
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

    const duplicate = icdCatalog.some((record) => normalizePanelKey(record.code) === normalizePanelKey(code));
    if (duplicate) {
      setFeedback(`ICD code "${code}" already exists.`, true);
      return;
    }

    const nextIcdRecord = sanitizeIcdCatalogRecord({ code, description });
    if (!nextIcdRecord) {
      setFeedback("Unable to create ICD code record.", true);
      return;
    }

    icdCatalog.push(nextIcdRecord);
    icdCatalog.sort((a, b) => String(a.code || "").localeCompare(String(b.code || "")));
    saveMasterRegistryState();
    syncAllPanelsToCatalogIcdCodes({ persist: true });
    editorMode = "";
    renderEditor();
    renderToolbar();
    renderRows();
    setFeedback(`Added ICD code "${code}" and mapped it to all panels.`);
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

  const icdCatalogRows = icdCatalog
    .map((item) => ({
      code: String(item?.code || "").trim(),
      description: String(item?.description || "").trim(),
    }))
    .filter((item) => item.code);
  const icdCatalogByCode = new Map(icdCatalogRows.map((item) => [item.code, item]));

  function parseIcdCodes(raw) {
    const source = Array.isArray(raw) ? raw : String(raw || "").split(",");
    return Array.from(
      new Set(
        source
          .map((code) => String(code || "").trim())
          .filter(Boolean)
      )
    );
  }

  function serializeIcdCodes(codes) {
    return parseIcdCodes(codes).join(", ");
  }

  function resolveIcdCodeFromInput(input) {
    const token = String(input || "").trim();
    if (!token) return "";
    if (icdCatalogByCode.has(token)) return token;

    const normalized = token.toLowerCase();
    const matches = icdCatalogRows.filter((item) => `${item.code} ${item.description}`.toLowerCase().includes(normalized));
    return matches.length === 1 ? matches[0].code : "";
  }

  function buildIcdSelectedChipsMarkup(codes) {
    if (!codes.length) return '<p class="subtle">No ICD codes selected.</p>';
    return `
      <div class="pm-icd-selected-list">
        ${codes
          .map((code) => `
            <span class="pm-icd-selected-chip">
              <span>${escapeHtml(code)}</span>
              <button type="button" data-pm-icd-remove data-code="${escapeHtml(code)}" aria-label="Remove ICD code ${escapeHtml(code)}">x</button>
            </span>
          `)
          .join("")}
      </div>
    `;
  }

  function buildIcdSuggestionsMarkup(selectedCodes, query) {
    const selected = new Set(selectedCodes);
    const needle = String(query || "").trim().toLowerCase();
    const matches = icdCatalogRows
      .filter((item) => !selected.has(item.code))
      .filter((item) => {
        if (!needle) return true;
        return `${item.code} ${item.description}`.toLowerCase().includes(needle);
      })
      .slice(0, 8);

    if (!matches.length) return '<p class="subtle">No matching ICD suggestions.</p>';
    return `
      <div class="pm-icd-suggestion-list">
        ${matches
          .map((item) => `
            <button type="button" class="pm-icd-suggestion-btn" data-pm-icd-suggest data-code="${escapeHtml(item.code)}">
              <span class="mono">${escapeHtml(item.code)}</span>
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
      setFeedback(`ICD code "${code}" is already selected.`);
      return false;
    }

    selectedCodes.push(code);
    selectedCodes.sort((a, b) => a.localeCompare(b));
    writeEditorIcdCodes(form, selectedCodes);

    const searchInput = form.querySelector("[data-pm-icd-search]");
    if (searchInput) searchInput.value = "";
    refreshEditorIcdSuggestions(form);
    setFeedback(`Added ICD code "${code}".`);
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
      ? { id: "", name: "", alias: "", price: 0, icdCodes: getAllPanelIcdCodes() }
      : getPanelById(editorPanelId);
    if (!panel) {
      editorMode = "";
      editorPanelId = "";
      editorNode.classList.add("hidden");
      editorNode.innerHTML = "";
      return;
    }

    const selectedIcdCodes = parseIcdCodes(Array.isArray(panel.icdCodes) ? panel.icdCodes : []);
    const icdSuggestionListId = `pm-icd-options-${normalizePanelIdValue(isCreate ? "create" : (panel.id || panel.name || "panel"))}`;

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
                list="${escapeHtml(icdSuggestionListId)}"
                placeholder="Search ICD code or description"
              >
              <button type="button" class="btn-ghost pm-row-btn" data-pm-icd-add>Add</button>
            </div>
          </label>
          <datalist id="${escapeHtml(icdSuggestionListId)}">
            ${icdCatalogRows.map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.description)}</option>`).join("")}
          </datalist>
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
          row.icdCodes.join(" "),
          prefix,
          String(row.price ?? ""),
          organisms.map((record) => record.scientific_name).join(" "),
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
        const codes = Array.isArray(row.icdCodes) ? row.icdCodes.slice() : [];
        const codeStickers = codes.length
          ? `
            <div class="pm-icd-sticker-list">
              ${codes
                .map((code) => `<span class="pm-icd-sticker">${escapeHtml(code)}</span>`)
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
      setFeedback(`Removed ICD code "${code}".`);
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

      syncAllPanelsToCatalogIcdCodes({ persist: true });
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

    syncAllPanelsToCatalogIcdCodes({ persist: true });
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

function renderOrderHistory() {
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
          <button type="button" class="history-tab active" data-tab="all-orders">All Orders</button>
          <button type="button" class="history-tab" data-tab="order-settlements">Order Settlements</button>
          <button type="button" class="history-tab" data-tab="add-service">Add Service To Order</button>
          <button type="button" class="history-tab" data-tab="upload-results">Upload Test Results</button>
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
  let activeTab = "all-orders";
  let uploadStatusMessage = "";
  const processingOrders = new Set();
  const generatingReports = new Set();
  const generatingSummaryReports = new Set();
  const generatingFinalReports = new Set();
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
    validate: "Validate",
    preview: "Preview",
    generateReport: "Generate Report",
    generateSummaryReport: "Summary Report",
    finalReport: "Final Report",
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

  function updateOrderById(orderId, mutator) {
    const orders = readOrders();
    const idx = orders.findIndex((row) => Number(row.orderId) === Number(orderId));
    if (idx < 0) return false;
    const updated = mutator({ ...orders[idx] });
    orders[idx] = updated;
    writeOrders(orders);
    return true;
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
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  function formatReportDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
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

    const threshold = 33;
    const genes = [
      { key: "e", label: "E Gene" },
      { key: "n", label: "N Gene" },
      { key: "orf1ab", label: "Orf1ab" },
    ].map((target) => {
      const row = markerRows.get(target.key);
      const ctValue = row ? parseReportCtNumericValue(row) : null;
      const ctDisplay = row ? (formatReportCtValue(row) || "-") : "-";
      return {
        ...target,
        ctValue,
        ctDisplay,
        metThreshold: Number.isFinite(ctValue) && ctValue <= threshold,
      };
    });

    const positiveGeneCount = genes.filter((gene) => gene.metThreshold).length;
    return {
      threshold,
      genes,
      positiveGeneCount,
      status: positiveGeneCount >= 2 ? "Positive" : "Negative",
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
      .filter(Boolean);
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

  function buildReportContext(order) {
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
      || "UTI Urine Swab";
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
    const providerAddress = joinAddressParts([
      providerRecord?.mailing_address,
      providerRecord?.provider_information?.mailingAddress,
      providerRecord?.city,
      providerRecord?.provider_information?.city,
      providerRecord?.state,
      providerRecord?.provider_information?.state,
      providerRecord?.zipcode,
      providerRecord?.provider_information?.zipcode,
    ]);
    const facilityAddress = joinAddressParts([
      facilityRecord?.mailing_address,
      facilityRecord?.city,
      facilityRecord?.state,
      facilityRecord?.zipcode,
    ]);

    const detailedRowsRaw = Array.isArray(report?.detailed) ? report.detailed : [];
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
        { label: "Address", value: providerAddress !== "-" ? providerAddress : facilityAddress },
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
    const context = buildReportContext(order);
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
    const context = buildReportContext(order);
    const variant = String(options?.variant || "summary").trim().toLowerCase() === "final" ? "final" : "summary";
    const reportTitle = variant === "final" ? "Final Report" : "Summary Report";
    const reportSectionTitle = variant === "final" ? "Final Lab Report" : "Summary Lab Report";
    const headerVariant = variant === "final" ? "final-summary" : "default";
    const applyRespiratorySarsRule = variant === "final" && isRespiratoryPathogensPanel(context.panelName);
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
        fileName: `Order_${order.orderId}_Final_Report.pdf`,
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
        fileName: `Order_${order.orderId}_Final_Report.pdf`,
      });
    } catch (error) {
      writeReportWindowError(reportWindow, {
        title: "Final Report Generation Failed",
        heading: "Unable to generate final report PDF",
        message: error?.message || "Unexpected error while generating final report PDF.",
      });
    }
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
        fileName: `Order_${order.orderId}_Summary_Report.pdf`,
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

async function requestRawWorkbookProcessing(file, panelName = "Lab Panel", expectedSampleId = "") {
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

async function requestRequisitionScanAutofill(file) {
  if (!csrfToken) await fetchCsrfToken();
  const contentBase64 = await fileToBase64(file);
  try {
    return await requestJson("/api/requisitions/extract-scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || "",
        contentBase64,
      }),
    });
  } catch (error) {
    const msg = String(error?.message || "");
    if (msg.includes("404")) {
      throw new Error("Scan import endpoint not found. Restart the server and try again.");
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
        expectedSampleId && expectedSampleId !== "-" ? expectedSampleId : ""
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

    const updated = updateOrderById(order.orderId, (row) => ({
      ...row,
      status: "Processed",
      processedAt: response.processedAt,
      rawUpload: {
        fileName: response.fileName,
        uploadedAt,
        notes,
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
        appendUploadResultsLog([
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
        appendUploadResultsLog([
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

      appendUploadResultsLog(logEntries);
      uploadStatusMessage = totalUpdatedOrders
        ? `Bulk upload complete. Updated ${totalUpdatedOrders} pending order(s).`
        : "Bulk upload complete. No pending orders matched the uploaded accession numbers.";
      renderUploadPanel();
      renderTable();
    });
  }

  function formatOrderDate(iso) {
    if (!iso) return "-";
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return "-";
    return value.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function money(value) {
    return `$ ${Number(value || 0).toFixed(0)}`;
  }

  function applyFilters(items) {
    const orderIdNeedle = (orderIdInput.value || "").trim().toLowerCase();
    const fromDate = fromDateInput.value ? new Date(`${fromDateInput.value}T00:00:00`) : null;
    const toDate = toDateInput.value ? new Date(`${toDateInput.value}T23:59:59`) : null;

    return items.filter((row) => {
      if (activeTab === "order-settlements" && row.status === "Pending") return false;
      if (activeTab === "add-service" && row.status !== "Pending") return false;
      if (orderIdNeedle && !String(row.orderId || "").toLowerCase().includes(orderIdNeedle)) return false;
      if (fromDate) {
        const value = new Date(row.createdAt);
        if (value < fromDate) return false;
      }
      if (toDate) {
        const value = new Date(row.createdAt);
        if (value > toDate) return false;
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

  function buildReportMarkup(order, options = {}) {
    const editable = Boolean(options.editable);
    const report = order?.processedResult?.report;
    if (!report) {
      return `
        <div class="history-preview-dialog">
          <div class="history-preview-head">
            <h3>${editable ? "Result Validate" : "Result Preview"}</h3>
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
        return `<div class="summary-empty">No ${label.toLowerCase()} detected in uploaded workbook.</div>`;
      }
      return entries
        .slice(0, 8)
        .map(({ item, sourceIndex }) => {
          if (!editable) {
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

    return `
      <div class="history-preview-dialog">
        <div class="history-preview-head">
          <h3>${editable ? "Result Validate" : "Result Preview"} • Order #${escapeHtml(order.orderId || "-")}</h3>
          <button type="button" class="preview-close-btn" data-close-preview>×</button>
        </div>
        <div class="history-preview-body">
          <article class="lab-report-preview">
            <h2 class="lab-panel-title">${escapeHtml(report.panelName || getOrderPanelName(order))}</h2>
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
                    <button type="button" class="table-action-btn validate-btn" data-save-validate="${escapeHtml(order.orderId)}">Save Validate</button>
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
    return nextReport;
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
    previewModalNode.innerHTML = buildReportMarkup(orderForMarkup, { editable: true });
    previewModalNode.classList.remove("hidden");
    if (options.scrollState) {
      requestAnimationFrame(() => {
        restoreValidationModalScrollState(options.scrollState, options);
      });
    }
  }

  function saveValidation(orderId) {
    const orderKey = String(orderId);
    const order = readOrders().find((item) => Number(item.orderId) === Number(orderId));
    const baseReport = validationDraftReports.get(orderKey) || order?.processedResult?.report;
    if (!baseReport) return false;
    const nextReport = collectValidationModalReport(baseReport);
    if (!nextReport) return false;
    validationDraftReports.set(orderKey, nextReport);
    validationUndoState.delete(orderKey);
    return updateOrderById(orderId, (row) => ({
      ...row,
      processedResult: {
        ...(row.processedResult || {}),
        report: nextReport,
      },
    }));
  }

  function analyzeValidation(orderId) {
    const { report: editedReport } = getCurrentValidationReport(orderId);
    if (!editedReport) return false;
    const analyzedReport = recalculateDetectedRows(editedReport);
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
    const { report } = getCurrentValidationReport(orderId);
    if (!report) return false;
    const nextReport = cloneValidationReport(report);
    if (!nextReport) return false;
    if (!Array.isArray(nextReport.detailed)) nextReport.detailed = [];
    nextReport.detailed.push({
      sample: "",
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
    previewModalNode.classList.add("hidden");
    previewModalNode.innerHTML = "";
  }

  function renderTable() {
    const rows = applyFilters(readOrders()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (!rows.length) {
      tableNode.innerHTML = `<p class="subtle table-empty">No orders found.</p>`;
      return;
    }

    tableNode.innerHTML = `
      <div class="order-history-meta">Rows: ${rows.length}</div>
      <table class="order-history-table">
        <thead>
          <tr>
            ${Object.entries(headerMap)
              .map(([key, title]) => `<th${key === "generateReport" || key === "generateSummaryReport" || key === "finalReport" ? ' class="generate-report-col"' : ""}>${title}</th>`)
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
            <th></th>
            <th><input data-filter-field="status" class="history-filter-input" placeholder="Filter"></th>
            <th></th>
            <th></th>
            <th class="generate-report-col"></th>
            <th class="generate-report-col"></th>
            <th class="generate-report-col"></th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const statusClass =
                row.status === "Processed"
                  ? "status-processed"
                  : row.status === "Complete"
                  ? "status-complete"
                  : "status-pending";
              const isBusy = processingOrders.has(Number(row.orderId));
              const isGenerating = generatingReports.has(Number(row.orderId));
              const isGeneratingSummary = generatingSummaryReports.has(Number(row.orderId));
              const isGeneratingFinal = generatingFinalReports.has(Number(row.orderId));
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
                  <td>
                    <div class="raw-upload-cell">
                      <input type="file" class="raw-upload-input" data-upload-file="${row.orderId}" accept=".xlsx,.xls,.xlsm">
                      <button type="button" class="table-action-btn" data-process-order="${row.orderId}" ${isBusy ? "disabled" : ""}>
                        ${isBusy ? "Processing..." : "Process"}
                      </button>
                    </div>
                    ${row.rawUpload?.fileName ? `<div class="subtle">${escapeHtml(row.rawUpload.fileName)}</div>` : ""}
                  </td>
                  <td><span class="history-status ${statusClass}">${row.status || "-"}</span></td>
                  <td>
                    ${
                      row.processedResult?.report
                        ? `<button type="button" class="table-action-btn validate-btn" data-validate-order="${row.orderId}">Validate</button>`
                        : `<span class="subtle">-</span>`
                    }
                  </td>
                  <td>
                    ${
                      row.processedResult?.report
                        ? `<button type="button" class="table-action-btn preview-btn" data-preview-order="${row.orderId}">Preview</button>`
                        : `<span class="subtle">-</span>`
                    }
                  </td>
                  <td class="report-action-cell">
                    ${
                      row.processedResult?.report
                        ? `<button type="button" class="table-action-btn generate-report-btn" data-generate-report-order="${row.orderId}" ${isGenerating ? "disabled" : ""}>${isGenerating ? "Generating..." : "Generate Report"}</button>`
                        : `<span class="subtle">-</span>`
                    }
                  </td>
                  <td class="report-action-cell">
                    ${
                      row.processedResult?.report
                        ? `<button type="button" class="table-action-btn summary-report-btn" data-generate-summary-report-order="${row.orderId}" ${isGeneratingSummary ? "disabled" : ""}>${isGeneratingSummary ? "Generating..." : "Summary Report"}</button>`
                        : `<span class="subtle">-</span>`
                    }
                  </td>
                  <td class="report-action-cell">
                    ${
                      row.processedResult?.report
                        ? `<button type="button" class="table-action-btn final-report-btn" data-generate-final-report-order="${row.orderId}" ${isGeneratingFinal ? "disabled" : ""}>${isGeneratingFinal ? "Generating..." : "Final Report"}</button>`
                        : `<span class="subtle">-</span>`
                    }
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;

    tableNode.querySelectorAll(".history-filter-input").forEach((input) => {
      const field = input.getAttribute("data-filter-field");
      if (field) input.value = filters[field] || "";
    });
  }

  tableNode.addEventListener("click", async (event) => {
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

    const previewBtn = event.target.closest("[data-preview-order]");
    if (previewBtn) {
      const orderId = previewBtn.getAttribute("data-preview-order");
      if (orderId) openPreview(orderId);
      return;
    }

    const generateReportBtn = event.target.closest("[data-generate-report-order]");
    if (generateReportBtn) {
      const orderId = generateReportBtn.getAttribute("data-generate-report-order");
      if (!orderId) return;
      const numericId = Number(orderId);
      if (generatingReports.has(numericId)) return;
      generatingReports.add(numericId);
      renderTable();
      try {
        await openGenerateReport(orderId);
      } finally {
        generatingReports.delete(numericId);
        renderTable();
      }
      return;
    }

    const generateSummaryReportBtn = event.target.closest("[data-generate-summary-report-order]");
    if (generateSummaryReportBtn) {
      const orderId = generateSummaryReportBtn.getAttribute("data-generate-summary-report-order");
      if (!orderId) return;
      const numericId = Number(orderId);
      if (generatingSummaryReports.has(numericId)) return;
      generatingSummaryReports.add(numericId);
      renderTable();
      try {
        await openGenerateSummaryReport(orderId);
      } finally {
        generatingSummaryReports.delete(numericId);
        renderTable();
      }
      return;
    }

    const generateFinalReportBtn = event.target.closest("[data-generate-final-report-order]");
    if (generateFinalReportBtn) {
      const orderId = generateFinalReportBtn.getAttribute("data-generate-final-report-order");
      if (!orderId) return;
      const numericId = Number(orderId);
      if (generatingFinalReports.has(numericId)) return;
      generatingFinalReports.add(numericId);
      renderTable();
      try {
        await openGenerateFinalReport(orderId);
      } finally {
        generatingFinalReports.delete(numericId);
        renderTable();
      }
      return;
    }

    const validateBtn = event.target.closest("[data-validate-order]");
    if (validateBtn) {
      const orderId = validateBtn.getAttribute("data-validate-order");
      if (orderId) openValidate(orderId);
      return;
    }
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

  previewModalNode?.addEventListener("click", (event) => {
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
      const updated = saveValidation(orderId);
      if (!updated) {
        alert("Unable to save validation values.");
        return;
      }
      renderTable();
      openValidate(orderId);
      return;
    }
    if (event.target.closest("[data-close-preview]") || event.target === previewModalNode) {
      closePreview();
    }
  });

  renderTable();
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
  link.download = `${entity}-${new Date().toISOString().slice(0, 10)}.csv`;
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

    if (event.target.closest("[data-provider-npi-fetch]")) {
      const npiSearch = form.querySelector('input[name="providerNpiSearch"]');
      const npiField = form.querySelector('input[name="npi"]');
      if (npiSearch && npiField && !npiField.value.trim()) npiField.value = npiSearch.value.trim();
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
  const accountQuery = facilityAccountsQuery.trim().toLowerCase();
  const providerQuery = facilityProvidersQuery.trim().toLowerCase();
  const filteredAccountEntries = accounts.reduce((list, row, index) => {
    if (!matchesAccountQuery(row, accountQuery)) return list;
    if (facilityAccountsDisabledOnly && !isAccountDisabled(row)) return list;
    list.push({
      row,
      index,
      identifier: resolveAccountIdentifier(row, index),
    });
    return list;
  }, []);
  const filteredProviderEntries = providers.reduce((list, row, index) => {
    if (!matchesProviderQuery(row, providerQuery)) return list;
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

  const accountToolbar =
    facilityTab === "accounts"
      ? `
        <div class="facility-accounts-toolbar">
          <div class="facility-account-search">
            <input id="facility-account-search" type="text" placeholder="Search Account Name / Contact Number" value="${escapeHtml(facilityAccountsQuery)}">
            <button type="button" class="facility-account-search-icon" aria-label="Search accounts">⌕</button>
          </div>
          <div class="facility-account-actions">
            <button type="button" class="facility-action-secondary ${facilityAccountsDisabledOnly ? "active" : ""}" data-facility-action="toggle-disabled">Disabled Accounts</button>
            <button type="button" class="facility-action-primary" data-facility-action="export-accounts">Export</button>
            <button type="button" class="facility-action-primary" data-facility-action="add-account">Add Account</button>
          </div>
        </div>
      `
      : "";

  const providerToolbar =
    facilityTab === "providers"
      ? `
        <div class="facility-accounts-toolbar">
          <div class="facility-account-search">
            <input id="facility-provider-search" type="text" placeholder="Search Provider" value="${escapeHtml(facilityProvidersQuery)}">
            <button type="button" class="facility-account-search-icon" aria-label="Search providers">⌕</button>
          </div>
          <div class="facility-account-actions">
            <button type="button" class="facility-action-tertiary" data-facility-action="bulk-upload-providers">Bulk Upload</button>
            <button type="button" class="facility-action-primary" data-facility-action="export-providers">Export</button>
            <button type="button" class="facility-action-primary" data-facility-action="add-provider">Add Provider</button>
          </div>
        </div>
      `
      : "";

  const tableHead = `
    <tr>
      ${tableColumns.map((col) => `<th>${escapeHtml(formatFacilityColumnLabel(col))}</th>`).join("")}
      <th>Actions</th>
    </tr>
  `;

  const tableBody = activeEntries.length
    ? activeEntries
        .map((entry) => {
          const row = entry.row;
          const cells = tableColumns.map((col) => `<td>${escapeHtml(row[col] ?? "-")}</td>`).join("");
          return `
            <tr>
              ${cells}
              <td class="facility-row-actions">
                <button type="button" class="table-action-btn" data-facility-row-action="edit" data-facility-entity="${facilityTab}" data-facility-id="${escapeHtml(entry.identifier)}">Edit</button>
                <button type="button" class="table-action-btn" data-facility-row-action="login-status" data-facility-entity="${facilityTab}" data-facility-id="${escapeHtml(entry.identifier)}">Login</button>
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="${Math.max(tableColumns.length + 1, 1)}" class="req-empty-cell">No ${activeLabel} loaded yet.</td></tr>`;

  panelBody.innerHTML = `
    <section class="card">
      <div class="order-history-topbar">
        <div class="order-history-tabs">
          <button type="button" class="history-tab ${facilityTab === "accounts" ? "active" : ""}" data-facility-tab="accounts">Accounts</button>
          <button type="button" class="history-tab ${facilityTab === "providers" ? "active" : ""}" data-facility-tab="providers">Providers</button>
        </div>
      </div>
      ${accountToolbar}
      ${providerToolbar}
      <div class="order-history-table-wrap facility-table-wrap">
        <div class="order-history-meta">${rowCountLabel}</div>
        <table class="order-history-table facility-table">
          <thead>${tableHead}</thead>
          <tbody>${tableBody}</tbody>
        </table>
      </div>
    </section>
  `;

  panelBody.querySelector(".order-history-tabs")?.addEventListener("click", (event) => {
    const tabBtn = event.target.closest("[data-facility-tab]");
    if (!tabBtn) return;
    const nextTab = tabBtn.getAttribute("data-facility-tab");
    if (!nextTab || nextTab === facilityTab) return;
    facilityTab = nextTab;
    renderFacility();
  });

  panelBody.querySelector("#facility-account-search")?.addEventListener("input", (event) => {
    facilityAccountsQuery = event.target.value || "";
    renderFacility();
  });

  panelBody.querySelector("#facility-provider-search")?.addEventListener("input", (event) => {
    facilityProvidersQuery = event.target.value || "";
    renderFacility();
  });

  panelBody.querySelector(".facility-accounts-toolbar")?.addEventListener("click", (event) => {
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

  panelBody.querySelector(".order-history-table")?.addEventListener("click", (event) => {
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
      case "master-registry":
        panelBody.classList.add("full-bleed");
        renderMasterRegistry();
        break;
      case "panel-master":
        panelBody.classList.add("full-bleed");
        renderPanelMaster();
        break;
      case "facility":
        panelBody.classList.add("full-bleed");
        renderFacility();
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

function mountApp() {
  document.body.classList.add("app-mode");
  authScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  renderNav();
  renderView();
  if (getVisibleViews().some((item) => item.key === "facility")) {
    loadFacilityData().catch(() => {});
  }
}

function mountAuth() {
  activeSession = {
    type: "doctor",
    accessType: "full",
    accountId: "",
    accountName: "",
    username: "",
  };
  currentSearchInput = null;
  document.body.classList.remove("app-mode");
  appShell.classList.add("hidden");
  authScreen.classList.remove("hidden");
  closeFacilityModals();
  loginForm.reset();
  setAuthMode("doctor");
  loginError.textContent = "";
}

authModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setAuthMode(button.getAttribute("data-auth-mode") || "doctor");
  });
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (pendingAuth) return;

  const email = document.getElementById("doctor-email").value.trim().toLowerCase();
  const clientUsername = document.getElementById("client-username").value.trim().toLowerCase();
  const password = document.getElementById("doctor-password").value;

  if (authMode === "doctor" && (!email.includes("@") || password.length < 10)) {
    loginError.textContent = "Enter a valid doctor email and a password with at least 10 characters.";
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
          ? { email, password }
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
      if (authMode === "doctor") {
        activeSession = {
          type: "doctor",
          accessType: "full",
          accountId: "",
          accountName: "",
          username: "",
        };
      } else {
        activeSession = {
          type: "client",
          accessType: loginResult?.clientUser?.accessType || "report_view",
          accountId: loginResult?.clientUser?.accountId || "",
          accountName: loginResult?.clientUser?.accountName || "",
          username: loginResult?.clientUser?.username || clientUsername,
        };
      }
      loginError.textContent = "";
      mountApp();
    } catch (error) {
      loginError.textContent = error.message || "Unable to sign in.";
      await fetchCsrfToken().catch(() => {});
    } finally {
      pendingAuth = false;
    }
  })();
});

logoutBtn.addEventListener("click", () => {
  (async () => {
    try {
      if (!csrfToken) await fetchCsrfToken();
      const endpoint = activeSession.type === "client" ? "/api/client-auth/logout" : "/api/auth/logout";
      await requestJson(endpoint, {
        method: "POST",
        headers: {
          "x-csrf-token": csrfToken,
        },
      });
    } catch {
      // Ignore logout API failures and still reset UI locally.
    } finally {
      csrfToken = "";
      await fetchCsrfToken().catch(() => {});
      mountAuth();
    }
  })();
});

(async () => {
  try {
    await fetchCsrfToken();
    const authState = await requestJson("/api/auth/me");
    if (authState.authenticated) {
      activeSession = {
        type: "doctor",
        accessType: "full",
        accountId: "",
        accountName: "",
        username: "",
      };
      mountApp();
      return;
    }
  } catch {
    // Default to auth screen when no valid server session exists.
  }

  try {
    const clientState = await requestJson("/api/client-auth/me");
    if (clientState.authenticated) {
      activeSession = {
        type: "client",
        accessType: clientState?.clientUser?.accessType || "report_view",
        accountId: clientState?.clientUser?.accountId || "",
        accountName: clientState?.clientUser?.accountName || "",
        username: clientState?.clientUser?.username || "",
      };
      mountApp();
      return;
    }
  } catch {
    // Continue to auth screen.
  }

  mountAuth();
})();

document.addEventListener("keydown", (event) => {
  const cmdOrCtrl = event.metaKey || event.ctrlKey;
  if (!cmdOrCtrl || event.key.toLowerCase() !== "j") return;
  if (!currentSearchInput) return;
  event.preventDefault();
  currentSearchInput.focus();
  currentSearchInput.select();
});
