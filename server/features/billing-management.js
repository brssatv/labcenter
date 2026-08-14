function normalizeBillerStatus(value) {
  return String(value || "").trim().toLowerCase() === "inactive" ? "inactive" : "active";
}

function normalizeFacilityIds(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return Array.from(
    new Set(
      source
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeAllFacilities(value) {
  return value === true || /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isCompletedOrder(order) {
  const status = String(order?.status || "").trim().toLowerCase();
  return Boolean(
    order?.completedAt
    || order?.pharmd?.completedAt
    || ["complete", "completed", "finalized"].includes(status)
  );
}

function resolveRegistrationForOrder(portalStore, order) {
  const entries = portalStore.listRegistrationsByPatientId(order?.patientId);
  const records = entries.map((entry) => entry?.record).filter(Boolean);
  if (!records.length) return null;

  const orderFacility = String(order?.facilityName || order?.accountName || "").trim().toLowerCase();
  const orderCreatedAt = new Date(order?.createdAt || 0).getTime();
  return records
    .map((record) => {
      const recordFacility = String(record?.facilityName || "").trim().toLowerCase();
      const facilityPenalty = orderFacility && recordFacility === orderFacility ? 0 : 1;
      const recordCreatedAt = new Date(record?.createdAt || 0).getTime();
      const timeDistance = Number.isFinite(orderCreatedAt) && Number.isFinite(recordCreatedAt)
        ? Math.abs(orderCreatedAt - recordCreatedAt)
        : Number.MAX_SAFE_INTEGER;
      return { record, facilityPenalty, timeDistance };
    })
    .sort((left, right) => left.facilityPenalty - right.facilityPenalty || left.timeDistance - right.timeDistance)[0]
    ?.record || null;
}

function formatPrintLabel(value) {
  return String(value || "")
    .replace(/^allergy_/, "")
    .replace(/^specimenType/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function renderPrintField(label, value) {
  const displayValue = String(value === null || value === undefined ? "" : value).trim() || "—";
  return `<div class="print-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(displayValue)}</dd></div>`;
}

function formatPrintDateTime(value, timeZone) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return String(value || "");
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: String(timeZone || "UTC"),
      timeZoneName: "short",
    }).format(parsed);
  } catch {
    return parsed.toISOString();
  }
}

function readOptionalPrintBoolean(record, keys) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const value = record[key];
    if (value === true || /^(1|true|yes|on|agree|agreed)$/i.test(String(value || "").trim())) return true;
    if (value === false || /^(0|false|no|off|decline|declined)$/i.test(String(value || "").trim())) return false;
  }
  return null;
}

function renderConsentChoice(id, label, selected) {
  return `
        <div class="consent-choice${selected ? " is-selected" : ""}" data-consent-choice="${escapeHtml(id)}" aria-checked="${selected ? "true" : "false"}" role="checkbox">
          <span class="consent-box" aria-hidden="true"></span>
          <span>${escapeHtml(label)}</span>
        </div>`;
}

function renderSignatureField(label, value) {
  const displayValue = String(value === null || value === undefined ? "" : value).trim();
  return `
        <div class="signature-field">
          <span class="signature-line">${escapeHtml(displayValue)}</span>
          <span class="signature-label">${escapeHtml(label)}</span>
        </div>`;
}

function buildPrintableRequisitionHtml(order, registration, { timeZone = "UTC" } = {}) {
  const record = registration && typeof registration === "object" ? registration : {};
  const services = Array.isArray(order?.services) ? order.services : [];
  const specimenTypes = Object.entries(record)
    .filter(([key, value]) => key.startsWith("specimenType") && value && !key.endsWith("Text"))
    .map(([key, value]) => String(value).trim() || formatPrintLabel(key))
    .filter(Boolean);
  const otherSpecimen = [record.specimenTypeWoundText, record.specimenTypeOtherText]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const allergies = Object.entries(record)
    .filter(([key, value]) => key.startsWith("allergy_") && Boolean(value))
    .map(([key]) => formatPrintLabel(key));
  const customAllergies = String(record.allergyCustomList || "")
    .split(/[,;\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const patientName = [record.firstName, record.middleName, record.lastName, record.suffix]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ") || String(order?.patientName || "").trim();
  const address = [record.address, record.address2, record.city, record.state, record.zipcode, record.country]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");
  const serviceRows = services.length
    ? services.map((service, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(service?.serviceName || "—")}</td>
          <td>${escapeHtml((Array.isArray(service?.icdCodes) ? service.icdCodes : []).join(", ") || "—")}</td>
        </tr>
      `).join("")
    : '<tr><td colspan="3">No ordered tests are saved.</td></tr>';
  const specimenRetentionConsent = readOptionalPrintBoolean(record, [
    "specimenRetentionConsent",
    "optionalSpecimenUseConsent",
  ]);
  const communicationsConsent = readOptionalPrintBoolean(record, [
    "communicationsConsent",
    "optionalCommunicationsConsent",
  ]);
  const acknowledgmentSignedBy = record.acknowledgmentSignedBy || record.patientSignatureName || "";
  const acknowledgmentRelationship = record.acknowledgmentRelationship || record.signatureRelationship || "";
  const acknowledgmentSignedAt = record.acknowledgmentSignedAt || record.patientSignatureDate || "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Requisition ${escapeHtml(order?.orderId || "")}</title>
  <link rel="stylesheet" href="/assets/requisition-print.css">
  <script src="/assets/requisition-print.js" defer></script>
</head>
<body>
  <div class="print-toolbar" aria-label="Print controls">
    <button type="button" data-print-requisition>Print Requisition</button>
    <button type="button" class="secondary" data-close-requisition>Close</button>
  </div>
  <main class="requisition-sheet">
    <header class="print-header">
      <div>
        <p class="eyebrow">LabCenter Clinical Portal</p>
        <h1>Completed Requisition</h1>
      </div>
      <div class="status-block">
        <span>${escapeHtml(order?.status || "Complete")}</span>
        <strong>Order #${escapeHtml(order?.orderId || "—")}</strong>
      </div>
    </header>

    <section class="identifier-grid">
      ${renderPrintField("Accession number", order?.accessionNo)}
      ${renderPrintField("Patient ID", order?.patientId || record.patientId)}
      ${renderPrintField("Submitted", formatPrintDateTime(order?.createdAt || record.createdAt, timeZone))}
      ${renderPrintField("Completed", formatPrintDateTime(order?.completedAt || order?.pharmd?.completedAt, timeZone))}
    </section>

    <section class="print-section">
      <h2>Facility and Provider</h2>
      <dl class="field-grid">
        ${renderPrintField("Reference lab", record.referenceLab)}
        ${renderPrintField("Facility", order?.facilityName || order?.accountName || record.facilityName)}
        ${renderPrintField("Provider", order?.provider || record.provider)}
        ${renderPrintField("Provider NPI", record.providerNpi)}
      </dl>
    </section>

    <section class="print-section">
      <h2>Patient Information</h2>
      <dl class="field-grid">
        ${renderPrintField("Patient name", patientName)}
        ${renderPrintField("Date of birth", order?.patientDob || record.dob)}
        ${renderPrintField("Sex", record.sex)}
        ${renderPrintField("MRN", record.mrn)}
        ${renderPrintField("Phone", record.phone)}
        ${renderPrintField("Email", record.email)}
        ${renderPrintField("Address", address)}
        ${renderPrintField("Race / Ethnicity", [record.race, record.ethnicity].filter(Boolean).join(" / "))}
      </dl>
    </section>

    <section class="print-section">
      <h2>Specimen Information</h2>
      <dl class="field-grid">
        ${renderPrintField("Collected", [record.collectionDate, record.collectionTime].filter(Boolean).join(" ") || order?.sampleCollectTime)}
        ${renderPrintField("Received", record.receivedDate)}
        ${renderPrintField("Specimen type", [...specimenTypes, ...otherSpecimen].join(", "))}
        ${renderPrintField("Additional information", record.additionalInformation)}
      </dl>
    </section>

    <section class="print-section">
      <h2>Ordered Tests and ICD Codes</h2>
      <table class="service-table">
        <thead><tr><th>#</th><th>Test / Panel</th><th>ICD Codes</th></tr></thead>
        <tbody>${serviceRows}</tbody>
      </table>
    </section>

    <section class="print-section">
      <h2>Billing Information</h2>
      <dl class="field-grid">
        ${renderPrintField("Billing type", formatPrintLabel(record.billingType))}
        ${renderPrintField("Primary insurance", formatPrintLabel(record.primaryInsurance))}
        ${renderPrintField("Primary policy / member", record.primaryMemberPolicy || record.primaryPolicy)}
        ${renderPrintField("Primary group", record.primaryGroup)}
        ${renderPrintField("Secondary insurance", record.secondaryInsurance)}
        ${renderPrintField("Secondary policy / member", record.secondaryMemberPolicy)}
        ${renderPrintField("Workers compensation", record.workersCompensation)}
        ${renderPrintField("Injury date", record.injuryDate)}
      </dl>
    </section>

    <section class="print-section">
      <h2>Allergies</h2>
      <p class="print-value">${escapeHtml([...allergies, ...customAllergies].join(", ") || "None recorded")}</p>
    </section>

    <section class="print-section patient-acknowledgment">
      <div class="acknowledgment-heading">
        <p class="acknowledgment-kicker">Respect · Choice · Privacy</p>
        <h2>Patient Acknowledgment</h2>
      </div>
      <p class="acknowledgment-intro">
        We support informed choice, responsible specimen stewardship, and clear communication. The choices below are optional and may be discussed with the laboratory or care team before signing.
      </p>
      <div class="principle-grid">
        <div class="principle-card">
          <h3>Specimen stewardship</h3>
          <p>After the ordered testing is complete, a remaining specimen may be retained for quality assurance, validation, education, or ethically reviewed research only as permitted by applicable law and laboratory policy. Additional authorization will be obtained when required.</p>
        </div>
        <div class="principle-card">
          <h3>Communication choice</h3>
          <p>The patient may choose whether to receive non-essential laboratory communications through the contact methods provided. Declining does not affect testing, access to results, or medically necessary care.</p>
        </div>
      </div>
      <div class="consent-groups">
        <div class="consent-group">
          <strong>Optional specimen retention or use</strong>
          ${renderConsentChoice("specimen-retention-agree", "I agree", specimenRetentionConsent === true)}
          ${renderConsentChoice("specimen-retention-decline", "I decline", specimenRetentionConsent === false)}
        </div>
        <div class="consent-group">
          <strong>Optional non-essential communications</strong>
          ${renderConsentChoice("communications-agree", "I agree", communicationsConsent === true)}
          ${renderConsentChoice("communications-decline", "I decline", communicationsConsent === false)}
        </div>
      </div>
      <p class="consent-record-note">Blank boxes mean no choice was recorded on this requisition.</p>
      <div class="signature-grid">
        ${renderSignatureField("Signature of patient or authorized representative", acknowledgmentSignedBy)}
        ${renderSignatureField("Relationship to patient", acknowledgmentRelationship)}
        ${renderSignatureField("Date", acknowledgmentSignedAt ? formatPrintDateTime(acknowledgmentSignedAt, timeZone) : "")}
      </div>
      <p class="accuracy-note"><strong>Important:</strong> Complete and accurate information supports timely testing and reporting. Missing information may delay processing, but will not be used to deny emergency or medically necessary care.</p>
    </section>

    <footer class="print-footer">
      <span>Read-only completed requisition</span>
      <span>Order #${escapeHtml(order?.orderId || "—")}</span>
    </footer>
  </main>
</body>
</html>`;
}

function sanitizeBiller(record, { includeAdminNotes = true } = {}) {
  const source = record && typeof record === "object" ? record : {};
  const sanitized = {
    id: String(source.id || ""),
    fullName: String(source.fullName || ""),
    company: String(source.company || ""),
    email: String(source.email || ""),
    phone: String(source.phone || ""),
    username: String(source.username || ""),
    status: normalizeBillerStatus(source.status),
    allFacilities: normalizeAllFacilities(source.allFacilities),
    facilityIds: normalizeFacilityIds(source.facilityIds),
    passwordConfigured: Boolean(source.passwordHash),
    createdAt: String(source.createdAt || ""),
    updatedAt: String(source.updatedAt || ""),
  };

  if (includeAdminNotes) {
    sanitized.notes = String(source.notes || "");
  }

  return sanitized;
}

function validateBillerPayload(payload, { requirePassword = false } = {}) {
  const fullName = String(payload?.fullName || "").trim();
  const company = String(payload?.company || "").trim();
  const email = String(payload?.email || "").trim().toLowerCase();
  const phone = String(payload?.phone || "").trim();
  const username = String(payload?.username || "").trim().toLowerCase().replace(/\s+/g, "");
  const password = String(payload?.password || "");
  const status = normalizeBillerStatus(payload?.status);
  const allFacilities = normalizeAllFacilities(payload?.allFacilities);
  const facilityIds = allFacilities ? [] : normalizeFacilityIds(payload?.facilityIds);
  const notes = String(payload?.notes || "").trim();

  if (!fullName) {
    return { error: "Biller name is required." };
  }
  if (!username) {
    return { error: "Portal username is required." };
  }
  if (!/^[a-z0-9._@-]{3,80}$/.test(username)) {
    return { error: "Portal username must be 3-80 characters and use letters, numbers, dots, dashes, underscores, or @." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if ((requirePassword || password) && password.length < 10) {
    return { error: "Portal password must be at least 10 characters." };
  }

  return {
    value: {
      fullName,
      company,
      email,
      phone,
      username,
      password,
      status,
      allFacilities,
      facilityIds,
      notes,
    },
  };
}

function registerBillingManagementRoutes({ app, dependencies }) {
  const {
    auditLog,
    createId,
    getAppTimeZone,
    hashPassword,
    loadBillers,
    canAccessOrderRecord,
    portalStore,
    requireBillingAuth,
    requireDoctorAuth,
    requireRequisitionPrintAuth,
    saveBillers,
  } = dependencies;

  app.get("/api/billers", requireDoctorAuth, (_req, res) => {
    return res.json({ billers: loadBillers().map((item) => sanitizeBiller(item)) });
  });

  app.get("/api/billing/profile", requireBillingAuth, (req, res) => {
    const id = String(req.session?.billerUser?.id || "");
    const biller = loadBillers().find((item) => String(item?.id || "") === id);
    if (!biller || normalizeBillerStatus(biller.status) !== "active") {
      return res.status(404).json({ error: "Billing profile not found." });
    }
    return res.json({ biller: sanitizeBiller(biller, { includeAdminNotes: false }) });
  });

  app.get("/api/billing/reports", requireBillingAuth, (req, res) => {
    const reports = portalStore
      .listOrders()
      .filter((order) => canAccessOrderRecord(req, order) && order?.generatedReports?.final)
      .map((order) => ({
        orderId: String(order?.orderId || ""),
        accessionNo: String(order?.accessionNo || ""),
        patientName: String(order?.patientName || ""),
        provider: String(order?.provider || ""),
        facilityId: String(order?.facilityId || order?.accountId || ""),
        facilityName: String(order?.facilityName || order?.accountName || ""),
        reportFileName: String(order?.generatedReports?.final?.fileName || ""),
        reportGeneratedAt: String(order?.generatedReports?.final?.generatedAt || ""),
        requisitionAvailable: isCompletedOrder(order),
      }))
      .sort((left, right) => String(right.reportGeneratedAt).localeCompare(String(left.reportGeneratedAt)));

    auditLog(req, "billing_reports_list", "success", {
      billerId: String(req.session?.billerUser?.id || ""),
      count: reports.length,
    });
    return res.json({ reports });
  });

  const renderCompletedRequisition = (req, res) => {
    const orderId = String(req.params?.orderId || "").trim();
    const order = orderId ? portalStore.getOrderById(orderId) : null;
    if (!order || !isCompletedOrder(order) || !canAccessOrderRecord(req, order)) {
      return res.status(404).json({ error: "Completed requisition not found." });
    }

    const registration = resolveRegistrationForOrder(portalStore, order);
    auditLog(req, "billing_requisition_print_view", "success", {
      billerId: String(req.session?.billerUser?.id || ""),
      orderId,
      registrationFound: Boolean(registration),
    });
    res.setHeader("Cache-Control", "private, max-age=0, no-store");
    return res.type("html").send(buildPrintableRequisitionHtml(order, registration, {
      timeZone: getAppTimeZone(),
    }));
  };

  app.get("/orders/:orderId/requisition-print", requireRequisitionPrintAuth, renderCompletedRequisition);
  app.get("/billing/orders/:orderId/requisition-print", requireRequisitionPrintAuth, renderCompletedRequisition);
  app.get("/api/billing/orders/:orderId/requisition-print", requireRequisitionPrintAuth, renderCompletedRequisition);

  app.post("/api/billers", requireDoctorAuth, (req, res) => {
    const validation = validateBillerPayload(req.body, { requirePassword: true });
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const values = validation.value;
    const billers = loadBillers();
    if (billers.some((item) => String(item?.username || "").trim().toLowerCase() === values.username)) {
      return res.status(409).json({ error: "That billing portal username is already in use." });
    }

    const now = new Date().toISOString();
    const biller = {
      id: createId(),
      fullName: values.fullName,
      company: values.company,
      email: values.email,
      phone: values.phone,
      username: values.username,
      passwordHash: hashPassword(values.password),
      status: values.status,
      allFacilities: values.allFacilities,
      facilityIds: values.facilityIds,
      notes: values.notes,
      createdAt: now,
      updatedAt: now,
    };

    billers.push(biller);
    saveBillers(billers);
    auditLog(req, "biller_create", "success", {
      billerId: biller.id,
      username: biller.username,
      status: biller.status,
    });
    return res.status(201).json({ biller: sanitizeBiller(biller) });
  });

  app.put("/api/billers/:id", requireDoctorAuth, (req, res) => {
    const id = String(req.params.id || "").trim();
    const billers = loadBillers();
    const index = billers.findIndex((item) => String(item?.id || "") === id);
    if (index < 0) {
      return res.status(404).json({ error: "Biller not found." });
    }

    const validation = validateBillerPayload(req.body);
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const values = validation.value;
    if (
      billers.some(
        (item, itemIndex) =>
          itemIndex !== index && String(item?.username || "").trim().toLowerCase() === values.username
      )
    ) {
      return res.status(409).json({ error: "That billing portal username is already in use." });
    }

    const existing = billers[index];
    const updated = {
      ...existing,
      fullName: values.fullName,
      company: values.company,
      email: values.email,
      phone: values.phone,
      username: values.username,
      status: values.status,
      allFacilities: values.allFacilities,
      facilityIds: values.facilityIds,
      notes: values.notes,
      passwordHash: values.password ? hashPassword(values.password) : existing.passwordHash,
      updatedAt: new Date().toISOString(),
    };

    billers[index] = updated;
    saveBillers(billers);
    auditLog(req, "biller_update", "success", {
      billerId: updated.id,
      username: updated.username,
      status: updated.status,
      passwordChanged: Boolean(values.password),
    });
    return res.json({ biller: sanitizeBiller(updated) });
  });
}

module.exports = {
  buildPrintableRequisitionHtml,
  isCompletedOrder,
  normalizeAllFacilities,
  normalizeBillerStatus,
  normalizeFacilityIds,
  registerBillingManagementRoutes,
  resolveRegistrationForOrder,
  sanitizeBiller,
  validateBillerPayload,
};
