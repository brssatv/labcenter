(function requisitionExportModule(globalScope) {
  "use strict";

  const DEFAULT_FIELD_KEYS = ["accession", "collectionDate", "patientId", "patientName"];
  const EXPORT_FIELDS = [
    { key: "accession", label: "Accession #", value: (row) => row.accession },
    { key: "collectionDate", label: "Sample Collection Date", value: (row) => row.collectionDate },
    { key: "patientId", label: "Patient ID", value: (row) => row.raw?.patientId },
    { key: "patientName", label: "Patient Name", value: (row) => [row.firstName, row.lastName].filter((part) => part && part !== "-").join(" ") },
    { key: "orderId", label: "Order #", value: (row) => row.orderId },
    { key: "dateOfBirth", label: "Date of Birth", value: (row) => row.dob },
    { key: "gender", label: "Gender", value: (row) => row.gender },
    { key: "status", label: "Status", value: (row) => row.status },
    { key: "testType", label: "Test Type", value: (row) => row.testType },
    { key: "labCode", label: "Lab Code", value: (row) => row.labCode },
    { key: "collectionTime", label: "Collection Time", value: (row) => row.collectionTime },
    { key: "provider", label: "Provider", value: (row) => row.raw?.provider || row.order?.provider },
    { key: "facility", label: "Facility", value: (row) => row.raw?.facilityName || row.order?.facilityName },
    { key: "phone", label: "Patient Phone", value: (row) => row.raw?.phone },
    { key: "mrn", label: "MRN", value: (row) => row.raw?.mrn },
  ];

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function buildCsv(rows, fieldKeys) {
    const fields = fieldKeys.map((key) => EXPORT_FIELDS.find((field) => field.key === key)).filter(Boolean);
    return [fields.map((field) => csvCell(field.label)).join(","), ...rows.map((row) => fields.map((field) => csvCell(field.value(row))).join(","))].join("\r\n");
  }

  function filterRowsByDate(rows, fromDate, toDate) {
    return rows.filter((row) => {
      const date = String(row.collectionDateKey || "");
      if (!date) return !fromDate && !toDate;
      return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
    });
  }

  function init({ trigger, getRows } = {}) {
    if (!trigger || typeof getRows !== "function") return () => {};
    let backdrop = null;
    const close = () => { backdrop?.remove(); backdrop = null; trigger.focus(); };
    const open = () => {
      if (backdrop) return;
      backdrop = document.createElement("div");
      backdrop.className = "req-export-backdrop";
      backdrop.innerHTML = `
        <section class="req-export-dialog" role="dialog" aria-modal="true" aria-labelledby="req-export-title" tabindex="-1">
          <header class="req-export-head"><div class="req-export-title-group"><span class="req-export-title-icon" aria-hidden="true">&#8595;</span><div><h3 id="req-export-title">Download requisition data</h3><p>Create a custom CSV export for your selected collection period.</p></div></div><button type="button" class="req-export-close" aria-label="Close">&times;</button></header>
          <div class="req-export-body">
            <section class="req-export-section"><div class="req-export-section-head"><div><h4>Collection period</h4><p>Leave both dates empty to include all requisitions.</p></div></div><div class="req-export-dates"><label><span>From date</span><input type="date" data-export-from></label><label><span>To date</span><input type="date" data-export-to></label></div></section>
            <fieldset class="req-export-fields req-export-section"><div class="req-export-section-head"><div><legend>Attributes to download</legend><p>Choose which columns should appear in the CSV file.</p></div><span class="req-export-recommended">4 recommended selected</span></div><div class="req-export-field-grid">
              ${EXPORT_FIELDS.map((field) => `<label><input type="checkbox" value="${field.key}" ${DEFAULT_FIELD_KEYS.includes(field.key) ? "checked" : ""}><span>${field.label}</span></label>`).join("")}
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
      const download = () => {
        const fromDate = fromInput.value;
        const toDate = toInput.value;
        const fields = Array.from(backdrop.querySelectorAll(".req-export-fields input:checked"), (input) => input.value);
        if (fromDate && toDate && fromDate > toDate) { status.textContent = "From date must be on or before To date."; fromInput.focus(); return; }
        if (!fields.length) { status.textContent = "Select at least one attribute to download."; return; }
        const rows = filterRowsByDate(getRows(), fromDate, toDate);
        if (!rows.length) { status.textContent = "No requisitions were found in this date range."; return; }
        const url = URL.createObjectURL(new Blob(["\uFEFF", buildCsv(rows, fields)], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `requisitions-${[fromDate, toDate].filter(Boolean).join("_to_") || "all-dates"}.csv`;
        document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); close();
      };
      backdrop.querySelector(".req-export-close").addEventListener("click", close);
      backdrop.querySelector("[data-export-cancel]").addEventListener("click", close);
      backdrop.querySelector("[data-export-download]").addEventListener("click", download);
      backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
      dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
      fromInput.focus();
    };
    trigger.addEventListener("click", open);
    return () => trigger.removeEventListener("click", open);
  }

  const api = { init, buildCsv, filterRowsByDate, DEFAULT_FIELD_KEYS, EXPORT_FIELDS };
  globalScope.RequisitionExport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
