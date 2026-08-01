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

function getPanelCatalogItemById(panelId) {
  const id = String(panelId || "").trim();
  if (!id) return null;
  return orderPanelCatalog.find((panel) => String(panel.id || "") === id) || null;
}

function normalizeRequisitionSummaryItems(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = normalizePanelKey(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getServiceLinePanelLabels(serviceLine = {}) {
  if (Array.isArray(serviceLine?.panelIds) && serviceLine.panelIds.length) {
    return normalizeRequisitionSummaryItems(
      serviceLine.panelIds.map((panelId) => {
        const panel = getPanelCatalogItemById(panelId);
        return panel?.name || panelId;
      })
    );
  }

  return normalizeRequisitionSummaryItems(
    String(serviceLine?.serviceName || "")
      .split(",")
      .map((value) => value.trim())
  );
}

function getServiceLineIcdItems(serviceLine = {}) {
  const rawCodes = Array.isArray(serviceLine?.icdCodes)
    ? serviceLine.icdCodes
    : String(serviceLine?.icdCodes || "")
      .split(/[\n,;]+/)
      .map((value) => value.trim());
  const codes = normalizeIcdCodeList(rawCodes);
  return codes.map((code) => {
    const record = getIcdCatalogRecord(code);
    return {
      code,
      label: record?.formattedCode || formatIcdCode(code),
      description: record?.description || "",
    };
  });
}

function getAllIcdCatalogRecords() {
  return (Array.isArray(icdCatalogSearchRows) ? icdCatalogSearchRows : [])
    .map((item) => getIcdCatalogRecord(item?.code || item))
    .filter(Boolean)
    .sort((a, b) => compareIcdCodes(a.code, b.code));
}

function getPanelMappedIcdCodeSet(serviceLine = {}) {
  const codes = new Set();
  if (Array.isArray(serviceLine?.panelIds) && serviceLine.panelIds.length) {
    serviceLine.panelIds.forEach((panelId) => {
      const panel = getPanelCatalogItemById(panelId);
      normalizeIcdCodeList(Array.isArray(panel?.icdCodes) ? panel.icdCodes : [])
        .forEach((code) => codes.add(code));
    });
  }
  return codes;
}

function buildRequisitionOrderSummary(record = {}, order = null) {
  const serviceLines = Array.isArray(order?.services) ? order.services.filter(Boolean) : [];
  const panelLabels = normalizeRequisitionSummaryItems(
    serviceLines.flatMap((line) => getServiceLinePanelLabels(line))
  );
  const icdItems = [];
  const seenIcdCodes = new Set();

  serviceLines
    .flatMap((line) => getServiceLineIcdItems(line))
    .forEach((item) => {
      if (!item?.code || seenIcdCodes.has(item.code)) return;
      seenIcdCodes.add(item.code);
      icdItems.push(item);
    });

  return {
    orderId: String(order?.orderId || "").trim(),
    accession: String(order?.accessionNo || order?.accession || "").trim(),
    patientId: String(record?.patientId || order?.patientId || "").trim(),
    panelLabels,
    icdItems,
  };
}

function renderSummaryChips(items, emptyText) {
  const rows = normalizeRequisitionSummaryItems(items);
  if (!rows.length) return `<p class="req-selected-empty">${escapeHtml(emptyText)}</p>`;
  return `
    <div class="req-selected-chip-list">
      ${rows.map((item) => `<span class="req-selected-chip">${escapeHtml(item)}</span>`).join("")}
    </div>
  `;
}

function renderRequisitionIcdSummary(items) {
  const rows = Array.isArray(items) ? items.filter((item) => item?.code) : [];
  if (!rows.length) return '<p class="req-selected-empty">No ICD codes are saved for this order.</p>';
  return `
    <div class="req-selected-icd-list">
      ${rows
        .map((item) => `
          <div class="req-selected-icd">
            <strong>${escapeHtml(item.label || formatIcdCode(item.code))}</strong>
            <span>${escapeHtml(item.description || "Description not available")}</span>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function getPanelCatalogItemsForLabels(panelLabels = []) {
  const selectedKeys = new Set(normalizeRequisitionSummaryItems(panelLabels).map((label) => normalizePanelKey(label)));
  return orderPanelCatalog.filter((panel) => {
    const candidates = [panel.id, panel.name, panel.alias].map(normalizePanelKey).filter(Boolean);
    return candidates.some((key) => selectedKeys.has(key));
  });
}

function renderRequisitionPanelEditor(summary) {
  const selectedPanels = getPanelCatalogItemsForLabels(summary?.panelLabels || []);
  const selectedIds = new Set(selectedPanels.map((panel) => panel.id));

  return `
    <form class="req-panel-editor hidden" data-req-panel-editor data-order-id="${escapeHtml(summary.orderId)}">
      <div class="req-icd-editor-toolbar">
        <button type="submit" class="btn-primary">Apply Panels</button>
        <button type="button" class="btn-ghost" data-req-panel-cancel>Cancel</button>
      </div>
      <div class="req-panel-editor-list">
        ${orderPanelCatalog
          .map((panel) => `
            <label class="req-icd-editor-row">
              <input type="checkbox" data-req-edit-panel-id="${escapeHtml(panel.id)}" ${selectedIds.has(panel.id) ? "checked" : ""}>
              <span>
                <strong>${escapeHtml(panel.name || panel.alias || panel.id)}</strong>
                <small>${escapeHtml(panel.alias && panel.alias !== panel.name ? panel.alias : "Panel catalog")}</small>
              </span>
            </label>
          `)
          .join("")}
      </div>
      <p class="req-icd-editor-status subtle" data-req-panel-status></p>
    </form>
  `;
}

function renderRequisitionIcdEditor(summary) {
  const selectedCodes = new Set((Array.isArray(summary?.icdItems) ? summary.icdItems : []).map((item) => item.code));

  return `
    <form class="req-icd-editor hidden" data-req-icd-editor data-order-id="${escapeHtml(summary.orderId)}">
      <div class="req-icd-editor-toolbar">
        <input data-req-icd-search placeholder="Search ICD code or description">
        <button type="submit" class="btn-primary">Apply ICD Codes</button>
        <button type="button" class="btn-ghost" data-req-icd-cancel>Cancel</button>
      </div>
      <div class="req-icd-editor-list" data-req-icd-selected>
        ${renderRequisitionIcdEditorRows(Array.from(selectedCodes))}
      </div>
      <div class="req-icd-editor-suggestions" data-req-icd-suggestions>
        ${renderRequisitionIcdSuggestionButtons(selectedCodes)}
      </div>
      <p class="req-icd-editor-status subtle" data-req-icd-status></p>
    </form>
  `;
}

function renderRequisitionIcdEditorRows(codes = []) {
  const rows = normalizeIcdCodeList(codes)
    .map((code) => getIcdCatalogRecord(code) || { code, formattedCode: formatIcdCode(code), description: "" });
  if (!rows.length) return '<p class="req-selected-empty">No ICD codes selected yet.</p>';
  return rows
    .map((item) => `
      <label class="req-icd-editor-row">
        <input type="checkbox" data-req-edit-icd-code="${escapeHtml(item.code)}" checked>
        <span>
          <strong>${escapeHtml(item.formattedCode || formatIcdCode(item.code))}</strong>
          <small>${escapeHtml(item.description || "Description not available")}</small>
        </span>
      </label>
    `)
    .join("");
}

function renderRequisitionIcdSuggestionButtons(selectedCodes = new Set(), query = "") {
  const selectedSet = selectedCodes instanceof Set ? selectedCodes : new Set(normalizeIcdCodeList(selectedCodes));
  const search = String(query || "").trim();
  const rows = getAllIcdCatalogRecords()
    .filter((record) => !selectedSet.has(record.code))
    .filter((record) => !search || matchesIcdSearch(record, search))
    .slice(0, 30);

  if (!rows.length) return '<p class="req-selected-empty">No matching ICD codes found.</p>';

  return rows
    .map((record) => `
      <button type="button" class="req-icd-suggestion" data-req-add-icd-code="${escapeHtml(record.code)}">
        <strong>${escapeHtml(record.formattedCode || formatIcdCode(record.code))}</strong>
        <span>${escapeHtml(record.description || "Description not available")}</span>
      </button>
    `)
    .join("");
}

function getSelectedRequisitionIcdCodes(editorNode) {
  return normalizeIcdCodeList(
    Array.from(editorNode?.querySelectorAll("[data-req-edit-icd-code]:checked") || [])
      .map((input) => input.getAttribute("data-req-edit-icd-code") || "")
  );
}

function refreshRequisitionIcdEditor(editorNode) {
  if (!editorNode) return;
  const selectedCodes = getSelectedRequisitionIcdCodes(editorNode);
  const selectedSet = new Set(selectedCodes);
  const selectedNode = editorNode.querySelector("[data-req-icd-selected]");
  const suggestionsNode = editorNode.querySelector("[data-req-icd-suggestions]");
  const searchNode = editorNode.querySelector("[data-req-icd-search]");
  if (selectedNode) selectedNode.innerHTML = renderRequisitionIcdEditorRows(selectedCodes);
  if (suggestionsNode) {
    suggestionsNode.innerHTML = renderRequisitionIcdSuggestionButtons(selectedSet, searchNode?.value || "");
  }
}

function buildOrderWithIcdCodes(order, icdCodes) {
  const codes = normalizeIcdCodeList(icdCodes);
  const services = Array.isArray(order?.services) ? order.services : [];
  if (!services.length) return null;
  return {
    ...order,
    services: services.map((serviceLine) => ({
      ...serviceLine,
      icdCodes: codes,
    })),
    updatedAt: new Date().toISOString(),
  };
}

async function saveOrderIcdCodes(orderId, icdCodes) {
  const saved = await updateOrderById(orderId, (order) => buildOrderWithIcdCodes(order, icdCodes));
  if (!saved) throw new Error("Unable to locate the saved order for this requisition.");
  return readOrders().find((order) => String(order?.orderId || "") === String(orderId || "")) || null;
}

function buildOrderWithPanels(order, panelIds) {
  const ids = Array.from(new Set((Array.isArray(panelIds) ? panelIds : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
  if (!ids.length) return null;
  const panelItems = ids
    .map((panelId) => getPanelCatalogItemById(panelId))
    .filter(Boolean);
  if (!panelItems.length) return null;

  const services = Array.isArray(order?.services) ? order.services : [];
  const firstLine = services[0] || {};
  const price = panelItems.reduce((total, panel) => total + (Number(panel.price) || 0), 0);
  const concession = Number(firstLine.concession) || 0;
  const serviceLine = {
    ...firstLine,
    lineNo: 1,
    serviceName: panelItems.map((panel) => panel.name).join(", "),
    panelIds: panelItems.map((panel) => panel.id),
    price,
    concession,
    due: Math.max(price - concession, 0),
  };
  return {
    ...order,
    accessionPrefix: resolvePanelPrefixFromService(serviceLine),
    services: [serviceLine],
    amount: price,
    concession,
    due: Math.max(price - concession, 0),
    updatedAt: new Date().toISOString(),
  };
}

async function saveOrderPanels(orderId, panelIds) {
  const saved = await updateOrderById(orderId, (order) => buildOrderWithPanels(order, panelIds));
  if (!saved) throw new Error("Unable to locate the saved order for this requisition.");
  return readOrders().find((order) => String(order?.orderId || "") === String(orderId || "")) || null;
}

function isPendingOrder(order) {
  const status = String(order?.status || "").trim().toLowerCase();
  if (status === "pending") return true;
  if (status !== "processed" || !order?.processedResult?.report) return false;

  const isCompleted = Boolean(order?.completedAt || order?.pharmd?.completedAt);
  const isPublished = Boolean(order?.publishedReports?.final?.publishedAt);
  return !isCompleted && !isPublished;
}

function getOrderAccessionPreview(order) {
  const existing = String(order?.accessionNo || order?.accession || "").trim();
  if (existing) return existing;
  if (!order?.orderId) return "";
  return buildAccessionNumber({
    serviceLine: Array.isArray(order?.services) ? order.services[0] : null,
    orderDate: order?.sampleCollectTime || order?.createdAt || new Date().toISOString(),
    orderId: order.orderId,
  });
}

function getOrderComputedAccession(order, orderIdOverride = "") {
  if (!order?.orderId && !orderIdOverride) return "";
  return buildAccessionNumber({
    serviceLine: Array.isArray(order?.services) ? order.services[0] : null,
    orderDate: order?.sampleCollectTime || order?.createdAt || new Date().toISOString(),
    orderId: orderIdOverride || order.orderId,
  });
}

function getOrderPanelIds(order) {
  return Array.from(new Set((Array.isArray(order?.services) ? order.services : [])
    .flatMap((line) => Array.isArray(line?.panelIds) ? line.panelIds : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
}

function getOrderIcdCodes(order) {
  return normalizeIcdCodeList((Array.isArray(order?.services) ? order.services : [])
    .flatMap((line) => Array.isArray(line?.icdCodes) ? line.icdCodes : []));
}

function areStringListsEqual(left = [], right = []) {
  const a = Array.from(new Set(left.map((value) => String(value || "").trim()).filter(Boolean))).sort();
  const b = Array.from(new Set(right.map((value) => String(value || "").trim()).filter(Boolean))).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function getRequisitionChangePlan(originalRecord, updatedRecord, originalOrder, draftOrder) {
  const fieldLabels = {
    referenceLab: "Reference lab",
    facilityName: "Facility",
    provider: "Provider",
    providerNpi: "Provider NPI",
    firstName: "First name",
    middleName: "Middle name",
    lastName: "Last name",
    suffix: "Suffix",
    dob: "DOB",
    sex: "Sex",
    mrn: "MRN",
    phone: "Phone",
    address: "Address",
    address2: "Address 2",
    city: "City",
    state: "State",
    zipcode: "Zip",
    county: "County",
    country: "Country",
    email: "Email",
    collectionDate: "Collection date",
    collectionTime: "Collection time",
    receivedDate: "Received date",
    billingType: "Billing type",
    primaryInsurance: "Primary insurance",
    primaryMemberPolicy: "Primary policy",
    additionalInformation: "Additional information",
  };
  const registrationChanges = Object.entries(fieldLabels)
    .filter(([key]) => String(originalRecord?.[key] || "") !== String(updatedRecord?.[key] || ""))
    .map(([, label]) => label);
  const originalPanelIds = getOrderPanelIds(originalOrder);
  const draftPanelIds = getOrderPanelIds(draftOrder);
  const originalIcdCodes = getOrderIcdCodes(originalOrder);
  const draftIcdCodes = getOrderIcdCodes(draftOrder);
  const originalAccession = getOrderAccessionPreview(originalOrder);
  const draftAccessionSameOrder = getOrderComputedAccession(draftOrder, originalOrder?.orderId || draftOrder?.orderId || "");
  const panelChanged = !areStringListsEqual(originalPanelIds, draftPanelIds);
  const icdChanged = !areStringListsEqual(originalIcdCodes, draftIcdCodes);
  const accessionWouldChange = panelChanged && originalAccession && draftAccessionSameOrder && originalAccession !== draftAccessionSameOrder;

  return {
    registrationChanges,
    panelChanged,
    icdChanged,
    accessionWouldChange,
    orderAction: accessionWouldChange ? "replace" : "update",
    originalAccession,
    draftAccessionSameOrder,
    originalPanelLabels: getServiceLinePanelLabels(Array.isArray(originalOrder?.services) ? originalOrder.services[0] : {}),
    draftPanelLabels: getServiceLinePanelLabels(Array.isArray(draftOrder?.services) ? draftOrder.services[0] : {}),
    originalIcdCodes,
    draftIcdCodes,
  };
}

function renderRequisitionOrderSummary(record = {}, order = null, options = {}) {
  if (!order) return "";
  const summary = buildRequisitionOrderSummary(record, order);
  const editable = Boolean(options.editable);
  const metaItems = [
    summary.orderId ? `Order #${summary.orderId}` : "",
    summary.accession ? `Accession #${summary.accession}` : "",
    summary.patientId ? `Patient #${summary.patientId}` : "",
  ].filter(Boolean);

  return `
    <section class="req-selected-summary" aria-label="Selected panels and ICD codes">
      <div class="req-selected-summary-head">
        <div>
          <p class="badge">Saved Order</p>
          <h3>Selected Panels and ICD Codes</h3>
        </div>
        ${metaItems.length ? `<p class="req-selected-meta">${metaItems.map(escapeHtml).join(" &middot; ")}</p>` : ""}
      </div>
      <div class="req-selected-summary-grid">
        <section class="req-selected-group">
          <div class="req-selected-group-head">
            <h4>Panels</h4>
            ${summary.orderId && editable ? '<button type="button" class="btn-ghost req-edit-icd-btn" data-req-panel-edit>Edit Panels</button>' : ""}
          </div>
          ${renderSummaryChips(summary.panelLabels, "No panels are saved for this order.")}
          ${summary.orderId && editable ? renderRequisitionPanelEditor(summary) : ""}
        </section>
        <section class="req-selected-group">
          <div class="req-selected-group-head">
            <h4>ICD Codes</h4>
            ${summary.orderId && editable ? '<button type="button" class="btn-ghost req-edit-icd-btn" data-req-icd-edit>Edit ICD Codes</button>' : ""}
          </div>
          ${renderRequisitionIcdSummary(summary.icdItems)}
          ${summary.orderId && editable ? renderRequisitionIcdEditor(summary) : ""}
        </section>
      </div>
    </section>
  `;
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
    return formatAppDate(value, {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    }, String(value));
  }

  function formatTime(value) {
    return formatAppTime(value, {
      hour: "numeric",
      minute: "2-digit",
    }, "");
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
    const historicalPatientName = String(order?.patientName || "").trim();
    const nameParts = splitPatientName(historicalPatientName);
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
    const sourceRecord = linkedRegistration ? { ...fallbackRecord, ...linkedRegistration } : { ...fallbackRecord };
    sourceRecord.patientId = order?.patientId || sourceRecord.patientId || "";
    if (historicalPatientName) {
      sourceRecord.firstName = nameParts.firstName;
      sourceRecord.lastName = nameParts.lastName;
    }
    if (order?.patientDob) sourceRecord.dob = order.patientDob;
    if (order?.provider) sourceRecord.provider = order.provider;
    if (order?.facilityName) sourceRecord.facilityName = order.facilityName;
    const collectionDateSource = order?.sampleCollectTime
      || sourceRecord?.collectionDate
      || order?.createdAt
      || sourceRecord?.createdAt
      || "";

    const orderId = order?.orderId ? String(order.orderId) : `COI-${String(index + 1).padStart(6, "0")}`;
    const accession = String(order?.accessionNo || "").trim() || buildAccessionNumber({
      serviceLine: Array.isArray(order?.services) ? order.services[0] : null,
      orderDate: collectionDateSource,
      orderId,
    });
    const collectionDateKey = getAppDateKey(collectionDateSource);
    const status = order?.status || "Pending";
    const testType = Array.isArray(order?.services) && order.services.length
      ? order.services.map((line) => line?.serviceName).filter(Boolean).join(", ")
      : "Infectious Disease";
    return {
      raw: sourceRecord,
      order,
      orderId,
      accession,
      firstName: sourceRecord.firstName || "-",
      lastName: sourceRecord.lastName || "-",
      dob: formatDate(sourceRecord.dob),
      gender: sourceRecord.sex || "-",
      status,
      testType,
      labCode: sourceRecord.labCode || "LABCENTER",
      collectionDate: formatDate(sourceRecord.collectionDate || collectionDateKey),
      collectionTime: formatTime(sourceRecord.collectionTime || order?.sampleCollectTime || ""),
      collectionDateKey,
      statusClass: getStatusClass(status),
    };
  }

  function rowMatchesFilters(row) {
    const globalNeedle = String(globalSearchInput.value || "").trim().toLowerCase();
    const fromDate = String(fromDateInput.value || "").trim();
    const toDate = String(toDateInput.value || "").trim();

    if (globalNeedle) {
      const haystack = [row.orderId, row.accession, row.firstName, row.lastName, row.raw.patientId]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(globalNeedle)) return false;
    }

    if (fromDate && row.collectionDateKey && row.collectionDateKey < fromDate) return false;
    if (toDate && row.collectionDateKey && row.collectionDateKey > toDate) return false;
    if (fromDate && !row.collectionDateKey) return false;

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
    renderRegistration(visibleRows[index].raw, { sourceOrder: visibleRows[index].order, mode: "view" });
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
