(function requisitionExportModule(globalScope) {
  "use strict";

  const DEFAULT_FIELD_KEYS = ["accession", "orderCreatedDate", "collectionDate", "patientId", "patientName"];
  const INSURANCE_FIELD_KEYS = [
    "billingType", "primaryInsurance", "primaryPolicy", "primaryGroup", "insurancePhone",
    "secondaryInsurance", "secondaryPolicy", "secondaryGroup", "tertiaryInsurance", "tertiaryPolicy",
    "tertiaryGroup", "workersCompensation", "workersPolicy", "compensationManager", "injuryDate",
  ];

  function formatExportDate(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [year, month, day] = text.split("-");
      return `${month}/${day}/${year}`;
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  }

  function parseUsDate(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [year, month, day] = text.split("-");
      const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
      if (
        date.getUTCFullYear() !== Number(year)
        || date.getUTCMonth() !== Number(month) - 1
        || date.getUTCDate() !== Number(day)
      ) return null;
      return text;
    }
    const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, month, day, year] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (
      date.getFullYear() !== Number(year)
      || date.getMonth() !== Number(month) - 1
      || date.getDate() !== Number(day)
    ) return null;
    return `${year}-${month}-${day}`;
  }

  function getDateOneMonthEarlier(dateKey) {
    const normalized = parseUsDate(dateKey);
    if (!normalized) return "";
    const [year, month, day] = normalized.split("-").map(Number);
    const targetMonthIndex = month - 2;
    const targetYear = targetMonthIndex < 0 ? year - 1 : year;
    const targetMonth = targetMonthIndex < 0 ? 12 : targetMonthIndex + 1;
    const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
  }

  function getLocalTodayDateKey() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  }

  function joinUnique(values) {
    return Array.from(new Set(values
      .map((value) => String(value || "").trim())
      .filter(Boolean)))
      .join(", ");
  }

  function getOrderServices(row) {
    return Array.isArray(row?.order?.services) ? row.order.services.filter(Boolean) : [];
  }

  function getPanelNames(row) {
    if (row?.panel) return String(row.panel);
    return joinUnique(getOrderServices(row).flatMap((line) => {
      const serviceNames = String(line?.serviceName || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      return serviceNames.length ? serviceNames : (Array.isArray(line?.panelIds) ? line.panelIds : []);
    }));
  }

  function getIcdCodes(row) {
    if (row?.icdCodes) return Array.isArray(row.icdCodes) ? joinUnique(row.icdCodes) : String(row.icdCodes);
    return joinUnique(getOrderServices(row).flatMap((line) => Array.isArray(line?.icdCodes)
      ? line.icdCodes
      : String(line?.icdCodes || "").split(/[\n,;]+/)));
  }

  const EXPORT_FIELDS = [
    { key: "accession", label: "Accession #", value: (row) => row.accession },
    { key: "orderCreatedDate", label: "Order Creation Date", value: (row) => row.orderCreatedDate || formatExportDate(row.order?.createdAt) },
    { key: "collectionDate", label: "Sample Collection Date", value: (row) => row.collectionDate },
    { key: "patientId", label: "Patient ID", value: (row) => row.raw?.patientId },
    { key: "patientName", label: "Patient Name", value: (row) => [row.firstName, row.lastName].filter((part) => part && part !== "-").join(" ") },
    { key: "orderId", label: "Order #", value: (row) => row.orderId },
    { key: "dateOfBirth", label: "Date of Birth", value: (row) => row.dob },
    { key: "gender", label: "Gender", value: (row) => row.gender },
    { key: "status", label: "Status", value: (row) => row.status },
    { key: "testType", label: "Test Type", value: (row) => row.testType },
    { key: "panel", label: "Panel", value: getPanelNames },
    { key: "icdCode", label: "ICD Code", value: getIcdCodes },
    { key: "labCode", label: "Lab Code", value: (row) => row.labCode },
    { key: "collectionTime", label: "Collection Time", value: (row) => row.collectionTime },
    { key: "sampleReceivedDate", label: "Sample Received Date", value: (row) => formatExportDate(row.raw?.receivedDate) },
    { key: "reportPublishedDate", label: "Report Published Date", value: (row) => formatExportDate(row.order?.publishedReports?.final?.publishedAt) },
    { key: "provider", label: "Provider", value: (row) => row.raw?.provider || row.order?.provider },
    { key: "facility", label: "Facility", value: (row) => row.raw?.facilityName || row.order?.facilityName },
    { key: "phone", label: "Patient Phone", value: (row) => row.raw?.phone },
    { key: "mrn", label: "MRN", value: (row) => row.raw?.mrn },
    { key: "allInsuranceDetails", label: "All Insurance Details", selectionOnly: true, selects: INSURANCE_FIELD_KEYS },
    { key: "billingType", label: "Billing Type", value: (row) => row.raw?.billingType },
    { key: "primaryInsurance", label: "Primary Insurance Provider", value: (row) => row.raw?.primaryInsurance },
    { key: "primaryPolicy", label: "Primary Policy ID", value: (row) => row.raw?.primaryMemberPolicy },
    { key: "primaryGroup", label: "Primary Group ID", value: (row) => row.raw?.primaryGroup || row.raw?.primaryGroupNo },
    { key: "insurancePhone", label: "Insurance Phone #", value: (row) => row.raw?.insurancePhone },
    { key: "secondaryInsurance", label: "Secondary Insurance Provider", value: (row) => row.raw?.secondaryInsurance },
    { key: "secondaryPolicy", label: "Secondary Policy ID", value: (row) => row.raw?.secondaryMemberPolicy },
    { key: "secondaryGroup", label: "Secondary Group ID", value: (row) => row.raw?.secondaryGroup || row.raw?.secondaryGroupNo },
    { key: "tertiaryInsurance", label: "Tertiary Insurance Provider", value: (row) => row.raw?.tertiaryInsurance },
    { key: "tertiaryPolicy", label: "Tertiary Policy ID", value: (row) => row.raw?.tertiaryMemberPolicy },
    { key: "tertiaryGroup", label: "Tertiary Group ID", value: (row) => row.raw?.tertiaryGroup || row.raw?.tertiaryGroupNo },
    { key: "workersCompensation", label: "Workers Compensation", value: (row) => row.raw?.workersCompensation },
    { key: "workersPolicy", label: "Workers Compensation Policy", value: (row) => row.raw?.workersMemberPolicy },
    { key: "compensationManager", label: "Compensation Manager", value: (row) => row.raw?.compensationManager },
    { key: "injuryDate", label: "Injury Date", value: (row) => formatExportDate(row.raw?.injuryDate) },
  ];

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function buildCsv(rows, fieldKeys) {
    const fields = fieldKeys
      .map((key) => EXPORT_FIELDS.find((field) => field.key === key))
      .filter((field) => field && !field.selectionOnly);
    return [fields.map((field) => csvCell(field.label)).join(","), ...rows.map((row) => fields.map((field) => csvCell(field.value(row))).join(","))].join("\r\n");
  }

  function getOrderCreatedDateKey(row) {
    const preparedKey = String(row?.orderCreatedDateKey || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(preparedKey)) return preparedKey;
    const value = String(row?.order?.createdAt || "").trim();
    if (!value) return "";
    const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoDate) return isoDate[1];
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function filterRowsByOrderCreatedDate(rows, fromDate, toDate) {
    return rows.filter((row) => {
      const date = getOrderCreatedDateKey(row);
      if (!date) return !fromDate && !toDate;
      return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
    });
  }

  function init({ trigger, getRows, getTodayDateKey = getLocalTodayDateKey } = {}) {
    if (!trigger || typeof getRows !== "function") return () => {};
    let backdrop = null;
    const close = () => { backdrop?.remove(); backdrop = null; trigger.focus(); };
    const open = () => {
      if (backdrop) return;
      backdrop = document.createElement("div");
      backdrop.className = "req-export-backdrop";
      backdrop.innerHTML = `
        <section class="req-export-dialog" role="dialog" aria-modal="true" aria-labelledby="req-export-title" tabindex="-1">
          <header class="req-export-head"><div class="req-export-title-group"><span class="req-export-title-icon" aria-hidden="true">&#8595;</span><div><h3 id="req-export-title">Download requisition data</h3><p>Create a custom CSV export for your selected order creation period.</p></div></div><button type="button" class="req-export-close" aria-label="Close">&times;</button></header>
          <div class="req-export-body">
            <section class="req-export-section"><div class="req-export-section-head"><div><h4>Order creation period</h4><p>Defaults to the previous month through today. Clear both dates to include all requisitions.</p></div></div><div class="req-export-dates"><div class="req-export-date-field"><span>From date (MM/DD/YYYY)</span><div class="req-export-date-control"><button type="button" aria-label="Choose From date" data-export-open-from><span data-export-from-display></span><span class="req-export-calendar-icon" aria-hidden="true">&#128197;</span></button><input class="req-export-native-date" type="date" tabindex="-1" aria-label="From date" data-export-from></div></div><div class="req-export-date-field"><span>To date (MM/DD/YYYY)</span><div class="req-export-date-control"><button type="button" aria-label="Choose To date" data-export-open-to><span data-export-to-display></span><span class="req-export-calendar-icon" aria-hidden="true">&#128197;</span></button><input class="req-export-native-date" type="date" tabindex="-1" aria-label="To date" data-export-to></div></div></div></section>
            <fieldset class="req-export-fields req-export-section"><div class="req-export-section-head"><div><legend>Attributes to download</legend><p>Choose which columns should appear in the CSV file.</p></div><span class="req-export-recommended">5 recommended selected</span></div><div class="req-export-field-grid">
              ${EXPORT_FIELDS.map((field) => `<label class="${field.selectionOnly ? "req-export-field-master" : ""}"><input type="checkbox" value="${field.key}" ${field.selectionOnly ? `data-export-selects="${field.selects.join(",")}"` : ""} ${DEFAULT_FIELD_KEYS.includes(field.key) ? "checked" : ""}><span>${field.label}</span></label>`).join("")}
            </div></fieldset>
            <p class="req-export-status" aria-live="polite"></p>
          </div>
          <footer class="req-export-footer"><p>CSV format &middot; Opens in Excel and Google Sheets</p><div><button type="button" class="btn-ghost" data-export-cancel>Cancel</button><button type="button" class="btn-primary req-export-download" data-export-download><span aria-hidden="true">&#8595;</span> Download CSV</button></div></footer>
        </section>`;
      document.body.appendChild(backdrop);
      const dialog = backdrop.querySelector(".req-export-dialog");
      const status = backdrop.querySelector(".req-export-status");
      const fromInput = backdrop.querySelector("[data-export-from]");
      const toInput = backdrop.querySelector("[data-export-to]");
      const fromButton = backdrop.querySelector("[data-export-open-from]");
      const toButton = backdrop.querySelector("[data-export-open-to]");
      const fromDisplay = backdrop.querySelector("[data-export-from-display]");
      const toDisplay = backdrop.querySelector("[data-export-to-display]");
      const syncDateDisplays = () => {
        fromDisplay.textContent = formatExportDate(fromInput.value) || "MM/DD/YYYY";
        toDisplay.textContent = formatExportDate(toInput.value) || "MM/DD/YYYY";
      };
      const openDatePicker = (input) => {
        if (typeof input.showPicker === "function") input.showPicker();
        else { input.focus(); input.click(); }
      };
      const download = () => {
        const fromDate = parseUsDate(fromInput.value);
        const toDate = parseUsDate(toInput.value);
        const fields = Array.from(new Set(
          Array.from(backdrop.querySelectorAll(".req-export-fields input:checked"), (input) => input.value)
            .flatMap((key) => EXPORT_FIELDS.find((field) => field.key === key)?.selects || [key])
        ));
        if (fromDate === null) { status.textContent = "Choose a valid From date."; fromButton.focus(); return; }
        if (toDate === null) { status.textContent = "Choose a valid To date."; toButton.focus(); return; }
        if (fromDate && toDate && fromDate > toDate) { status.textContent = "From date must be on or before To date."; fromButton.focus(); return; }
        if (!fields.length) { status.textContent = "Select at least one attribute to download."; return; }
        const rows = filterRowsByOrderCreatedDate(getRows(), fromDate, toDate);
        if (!rows.length) { status.textContent = "No requisitions were created in this date range."; return; }
        const url = URL.createObjectURL(new Blob(["\uFEFF", buildCsv(rows, fields)], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `requisitions-created-${[fromDate, toDate].filter(Boolean).join("_to_") || "all-dates"}.csv`;
        document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); close();
      };
      const updateDateMatchStatus = () => {
        const fromDate = parseUsDate(fromInput.value);
        const toDate = parseUsDate(toInput.value);
        if (fromDate === null || toDate === null || (fromDate && toDate && fromDate > toDate)) {
          status.textContent = "";
          return;
        }
        const allRows = getRows();
        if (!fromDate && !toDate) {
          status.textContent = `All ${allRows.length} requisitions will be included.`;
          return;
        }
        const matchCount = filterRowsByOrderCreatedDate(allRows, fromDate, toDate).length;
        status.textContent = `${matchCount} of ${allRows.length} requisitions match this order creation period.`;
      };
      backdrop.querySelector(".req-export-close").addEventListener("click", close);
      backdrop.querySelector("[data-export-cancel]").addEventListener("click", close);
      backdrop.querySelector("[data-export-download]").addEventListener("click", download);
      fromInput.addEventListener("change", () => { syncDateDisplays(); updateDateMatchStatus(); });
      toInput.addEventListener("change", () => { syncDateDisplays(); updateDateMatchStatus(); });
      fromButton.addEventListener("click", () => openDatePicker(fromInput));
      toButton.addEventListener("click", () => openDatePicker(toInput));
      const todayDateKey = parseUsDate(getTodayDateKey()) || getLocalTodayDateKey();
      fromInput.value = getDateOneMonthEarlier(todayDateKey);
      toInput.value = todayDateKey;
      syncDateDisplays();
      updateDateMatchStatus();
      backdrop.querySelectorAll("[data-export-selects]").forEach((masterInput) => {
        const keys = String(masterInput.dataset.exportSelects || "").split(",").filter(Boolean);
        masterInput.addEventListener("change", () => {
          keys.forEach((key) => {
            const fieldInput = backdrop.querySelector(`.req-export-fields input[value="${key}"]`);
            if (fieldInput) fieldInput.checked = masterInput.checked;
          });
        });
        keys.forEach((key) => {
          const fieldInput = backdrop.querySelector(`.req-export-fields input[value="${key}"]`);
          fieldInput?.addEventListener("change", () => {
            masterInput.checked = keys.every((selectionKey) => backdrop.querySelector(`.req-export-fields input[value="${selectionKey}"]`)?.checked);
          });
        });
      });
      backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
      dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
      fromButton.focus();
    };
    trigger.addEventListener("click", open);
    return () => trigger.removeEventListener("click", open);
  }

  const api = { init, buildCsv, filterRowsByOrderCreatedDate, formatExportDate, getDateOneMonthEarlier, parseUsDate, DEFAULT_FIELD_KEYS, INSURANCE_FIELD_KEYS, EXPORT_FIELDS };
  globalScope.RequisitionExport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
