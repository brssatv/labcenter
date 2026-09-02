const requisitionScanReviewSections = [
  {
    title: "Facility Information",
    description: "Review the ordering location and provider details we found in the scan.",
    fields: [
      { key: "referenceLab", label: "Reference Lab" },
      { key: "facilityName", label: "Facility" },
      { key: "provider", label: "Provider" },
      { key: "providerNpi", label: "Provider NPI", inputMode: "numeric" },
    ],
  },
  {
    title: "Patient Information",
    description: "Patient demographics and contact details extracted from the requisition.",
    fields: [
      { key: "firstName", label: "First Name" },
      { key: "middleName", label: "Middle Name" },
      { key: "lastName", label: "Last Name" },
      { key: "suffix", label: "Suffix" },
      { key: "dob", label: "Patient DOB", type: "date" },
      {
        key: "sex",
        label: "Sex",
        type: "select",
        options: [
          { value: "", label: "Select Sex" },
          { value: "Male", label: "Male" },
          { value: "Female", label: "Female" },
          { value: "Other", label: "Other" },
        ],
      },
      { key: "mrn", label: "Patient ID (MRN)" },
      { key: "phone", label: "Contact Number", inputMode: "tel" },
      {
        key: "phoneBelongsTo",
        label: "Phone Belongs To",
        type: "select",
        options: [
          { value: "", label: "Select owner" },
          { value: "Patient", label: "Patient" },
          { value: "Relative/Guardian", label: "Relative/Guardian" },
        ],
      },
      { key: "address", label: "Address 1", full: true },
      { key: "address2", label: "Address 2", full: true },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "zipcode", label: "Zip Code", inputMode: "numeric" },
      { key: "county", label: "County" },
      { key: "country", label: "Country" },
      { key: "email", label: "Email", type: "email", inputMode: "email" },
      { key: "ethnicity", label: "Ethnicity" },
      { key: "race", label: "Race" },
    ],
  },
  {
    title: "Specimen Information",
    description: "Collection timing and specimen details recognized from the uploaded scan.",
    fields: [
      { key: "collectionDate", label: "Date Of Collection", type: "date" },
      { key: "collectionTime", label: "Time Of Collection", type: "time" },
      { key: "receivedDate", label: "Date Received", type: "date" },
      { key: "specimenTypeSwab", label: "Swab specimen selected", type: "checkbox", checkboxValue: "Swab" },
      { key: "specimenTypeWound", label: "Wound specimen selected", type: "checkbox", checkboxValue: "Wound" },
      { key: "specimenTypeWoundLocation", label: "Wound Location", full: true, dependsOn: "specimenTypeWound" },
      { key: "specimenTypeOther", label: "Other specimen selected", type: "checkbox", checkboxValue: "Others" },
      { key: "specimenTypeOtherText", label: "Specify Other Specimen", full: true, dependsOn: "specimenTypeOther" },
      { key: "additionalInformation", label: "Additional Information", type: "textarea", rows: 4, full: true },
    ],
  },
  {
    title: "Billing Information",
    description: "Insurance and billing selections extracted from the requisition.",
    fields: [
      {
        key: "billingType",
        label: "Billing Type",
        type: "select",
        options: [
          { value: "", label: "Select Billing Type" },
          { value: "selfPay", label: "Self Pay" },
          { value: "commercial", label: "Commercial" },
          { value: "medicare", label: "Medicare" },
          { value: "medicaid", label: "Medicaid" },
          { value: "workersComp", label: "Workers Comp" },
          { value: "clientBill", label: "Client Bill" },
          { value: "uninsured", label: "Uninsured" },
        ],
      },
      { key: "primaryInsurance", label: "Primary Insurance Provider" },
      { key: "primaryMemberPolicy", label: "Primary Policy ID" },
      { key: "primaryGroup", label: "Primary Group ID" },
      { key: "insurancePhone", label: "Insurance Phone #", inputMode: "tel" },
      { key: "secondaryInsurance", label: "Secondary Insurance" },
      { key: "secondaryMemberPolicy", label: "Secondary Policy ID" },
      { key: "tertiaryInsurance", label: "Tertiary Insurance" },
      { key: "tertiaryMemberPolicy", label: "Tertiary Policy ID" },
      { key: "workersCompensation", label: "Workers Compensation" },
      { key: "workersMemberPolicy", label: "Member Policy" },
      { key: "compensationManager", label: "Compensation Manager" },
      { key: "injuryDate", label: "Injury Date", type: "date" },
    ],
  },
];

const requisitionScanReviewFieldIndex = new Map(
  requisitionScanReviewSections.flatMap((section) => section.fields.map((field) => [field.key, field]))
);

function renderRequisitionScanReviewField(field, values) {
  const rawValue = values?.[field.key];
  const value = rawValue == null ? "" : String(rawValue);
  const escapedName = escapeHtml(field.key);
  const placeholder = escapeHtml(field.placeholder || field.label);

  if (field.type === "checkbox") {
    const checked = value === String(field.checkboxValue || "on");
    return `
      <div class="scan-review-field scan-review-checkbox-wrap ${field.full ? "full" : ""}" data-scan-review-field="${escapedName}">
        <label class="scan-review-check">
          <input type="checkbox" name="${escapedName}" value="${escapeHtml(field.checkboxValue || "on")}" ${checked ? "checked" : ""}>
          <span class="scan-review-check-mark" aria-hidden="true"></span>
          <span>${escapeHtml(field.label)}</span>
        </label>
      </div>
    `;
  }

  const dependentAttr = field.dependsOn ? ` data-scan-review-depends-on="${escapeHtml(field.dependsOn)}"` : "";
  const visibilityClass = field.dependsOn && !values?.[field.dependsOn] ? " hidden" : "";
  const fieldClass = `scan-review-field${field.full ? " full" : ""}${visibilityClass}`;

  if (field.type === "textarea") {
    return `
      <label class="${fieldClass}" data-scan-review-field="${escapedName}"${dependentAttr}>
        <span>${escapeHtml(field.label)}</span>
        <textarea name="${escapedName}" rows="${Number(field.rows || 3)}" placeholder="${placeholder}">${escapeHtml(value)}</textarea>
      </label>
    `;
  }

  if (field.type === "select") {
    const options = Array.isArray(field.options) ? field.options : [];
    const optionMarkup = options
      .map((option) => {
        const optionValue = String(option?.value || "");
        return `<option value="${escapeHtml(optionValue)}"${optionValue === value ? " selected" : ""}>${escapeHtml(option?.label || optionValue)}</option>`;
      })
      .join("");
    return `
      <label class="${fieldClass}" data-scan-review-field="${escapedName}"${dependentAttr}>
        <span>${escapeHtml(field.label)}</span>
        <select name="${escapedName}">
          ${optionMarkup}
        </select>
      </label>
    `;
  }

  const inputType = field.type || "text";
  const inputModeAttr = field.inputMode ? ` inputmode="${escapeHtml(field.inputMode)}"` : "";
  return `
    <label class="${fieldClass}" data-scan-review-field="${escapedName}"${dependentAttr}>
      <span>${escapeHtml(field.label)}</span>
      <input type="${escapeHtml(inputType)}" name="${escapedName}" value="${escapeHtml(value)}" placeholder="${placeholder}"${inputModeAttr}>
    </label>
  `;
}

function buildRequisitionScanReviewMarkup(values = {}, matchedFields = []) {
  const matchedSet = new Set(
    (Array.isArray(matchedFields) && matchedFields.length ? matchedFields : Object.keys(values || {}))
      .map((key) => String(key || "").trim())
      .filter(Boolean)
  );
  const includedFieldKeys = [];

  const markup = requisitionScanReviewSections
    .map((section) => {
      const visibleFields = section.fields.filter((field) => matchedSet.has(field.key));
      if (!visibleFields.length) return "";
      includedFieldKeys.push(...visibleFields.map((field) => field.key));
      return `
        <section class="scan-review-section">
          <div class="scan-review-section-head">
            <h4>${escapeHtml(section.title)}</h4>
            <p>${escapeHtml(section.description)}</p>
          </div>
          <div class="scan-review-grid">
            ${visibleFields.map((field) => renderRequisitionScanReviewField(field, values)).join("")}
          </div>
        </section>
      `;
    })
    .filter(Boolean)
    .join("");

  return {
    markup: markup || '<p class="scan-review-empty">No extracted requisition fields were available to review.</p>',
    fieldKeys: Array.from(new Set(includedFieldKeys)),
  };
}

function renderRegistration(prefillData = null, options = {}) {
  if (prefillData) requisitionSubtab = "create";
  if (requisitionSubtab === "view") {
    renderRequisitionList();
    return;
  }

  let sourceOrder = options?.sourceOrder || prefillData?._sourceOrder || null;
  const requisitionMode = options?.mode === "view" ? "view" : options?.mode === "modify" ? "modify" : "create";
  const isViewedRequisition = Boolean(prefillData && sourceOrder && requisitionMode !== "create");
  const originalRequisitionRecord = options?.originalRecord || (prefillData ? JSON.parse(JSON.stringify(prefillData)) : null);
  const originalSourceOrder = options?.originalSourceOrder || (sourceOrder ? JSON.parse(JSON.stringify(sourceOrder)) : null);
  const canModifyViewedRequisition = isViewedRequisition && isPendingOrder(sourceOrder);
  const canRejectViewedOrder = isViewedRequisition && canRejectOrder(sourceOrder);
  const isReadOnlyRequisition = requisitionMode === "view";
  const savedRegistrationCreatedAt = String(prefillData?.createdAt || "").trim();

  function renderAuditTimeline(events = []) {
    const workflowApi = getRequisitionWorkflowApi();
    const rows = workflowApi.mergeAuditEvents(events, sourceOrder);
    if (!rows.length) return '<p class="req-audit-empty">No audit activity is available yet.</p>';
    return rows.map((event) => `
      <div class="req-audit-event req-audit-event--${escapeHtml(event.eventType || "updated")}">
        <span class="req-audit-dot" aria-hidden="true"></span>
        <div>
          <strong>${escapeHtml(workflowApi.getAuditEventLabel(event.eventType))}</strong>
          <time>${escapeHtml(formatAppDateTime(event.eventAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }, "-"))}</time>
          <small>By ${escapeHtml(event.actor || "System")}</small>
          ${event.reason ? `<p><b>Reason:</b> ${escapeHtml(event.reason)}</p>` : ""}
        </div>
      </div>
    `).join("");
  }

  panelBody.innerHTML = `
    <div class="requisition-context-layout">
      <div class="requisition-context-main">
    <div class="requisition-top-controls">
      ${renderRequisitionTabsMarkup()}
      ${
        isViewedRequisition
          ? `
            <div class="req-modify-strip">
              <div>
                <p class="requisition-scan-title">${isReadOnlyRequisition ? "Viewing saved requisition" : "Modifying saved requisition"}</p>
                <p class="requisition-scan-hint">${
                  canModifyViewedRequisition
                    ? isReadOnlyRequisition
                      ? "Fields are locked until the clinician chooses to modify this pending requisition."
                      : "Update the requisition details, panels, or ICD codes, then save the changes."
                    : "Only pending orders can be modified. This requisition is locked because the linked order is no longer pending."
                }</p>
              </div>
              <button type="button" id="req-modify-toggle" class="btn-primary" ${isReadOnlyRequisition && canModifyViewedRequisition ? "" : "disabled"}>Modify Requisition</button>
            </div>
          `
          : ""
      }
      <div class="requisition-scan-strip">
        <div class="requisition-scan-copy">
          <p class="requisition-scan-title">Upload scan copy</p>
          <p class="requisition-scan-hint">Import a scanned requisition PDF or image and autofill the form fields we can recognize. Review the result before saving.</p>
        </div>
        <div class="requisition-scan-actions">
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

    ${renderRequisitionOrderSummary(prefillData || {}, sourceOrder, { editable: !isReadOnlyRequisition && canModifyViewedRequisition })}
      </div>
      ${isViewedRequisition ? `
        <aside class="req-audit-card" aria-label="Requisition audit log">
          <div class="req-audit-head">
            <span>AUDIT</span>
            <h3>Requisition Audit Log</h3>
          </div>
          <div id="requisition-audit-events" class="req-audit-timeline">${renderAuditTimeline()}</div>
        </aside>
      ` : ""}
    </div>

    <form id="registration-form" class="registration-form requisition-form">
      <div class="requisition-layout">
        <div class="requisition-column">
          <section class="requisition-card">
            <h4 class="requisition-card-title title-dark">Facility Information</h4>
            <div class="field-grid one-col">
              <label><span>Reference Lab</span><input name="referenceLab" placeholder="Reference Lab"></label>
            </div>
            <div class="field-grid one-col">
              <label><span>Facility *</span>
                <div id="req-facility-combobox" class="provider-combobox" role="combobox" aria-haspopup="listbox" aria-owns="req-facility-results" aria-expanded="false">
                  <div class="search-input-row provider-input-row">
                    <input
                      name="facilityName"
                      id="req-facility-name"
                      type="text"
                      value="${escapeHtml(prefillData?.facilityName || "")}"
                      placeholder="Type facility name"
                      autocomplete="off"
                      spellcheck="false"
                      aria-autocomplete="list"
                      aria-controls="req-facility-results"
                      aria-expanded="false"
                      required
                    >
                    <button type="button" id="req-facility-toggle" class="search-icon-btn provider-toggle-btn" aria-label="Show matching facilities">⌕</button>
                  </div>
                  <div id="req-facility-results" class="provider-results hidden" role="listbox" aria-label="Matching facilities"></div>
                </div>
              </label>
            </div>
            <div class="field-grid two-col">
              <label><span>Provider *</span>
                <div id="req-provider-combobox" class="provider-combobox" role="combobox" aria-haspopup="listbox" aria-owns="req-provider-results" aria-expanded="false">
                  <div class="search-input-row provider-input-row">
                    <input
                      name="provider"
                      id="req-provider-name"
                      type="text"
                      value="${escapeHtml(prefillData?.provider || "")}"
                      placeholder="Type provider name or NPI"
                      autocomplete="off"
                      spellcheck="false"
                      aria-autocomplete="list"
                      aria-controls="req-provider-results"
                      aria-expanded="false"
                      required
                    >
                    <button type="button" id="req-provider-toggle" class="search-icon-btn provider-toggle-btn" aria-label="Show matching providers">⌕</button>
                  </div>
                  <div id="req-provider-results" class="provider-results hidden" role="listbox" aria-label="Matching providers"></div>
                </div>
              </label>
              <label><span>Provider NPI</span><input name="providerNpi" id="req-provider-npi" placeholder="Provider NPI" readonly></label>
            </div>
            ${
              activeSession.type === "doctor"
                ? `
                  <div class="field-grid one-col">
                    <button type="button" id="req-add-provider" class="quick-add-inline-btn">
                      <span class="quick-add-inline-badge">New</span>
                      <strong>Add custom provider</strong>
                      <span>Save a provider that is missing from this list and use it in this requisition.</span>
                    </button>
                  </div>
                `
                : ""
            }
          </section>

          <section class="requisition-card">
            <h4 class="requisition-card-title title-blue">Patient Information</h4>
            <div class="field-grid three-col">
              <label><span>First Name *</span><input name="firstName" placeholder="First Name" required></label>
              <label><span>Middle Name</span><input name="middleName" placeholder="Middle Name"></label>
              <label><span>Last Name *</span><input name="lastName" placeholder="Last Name" required></label>
            </div>
            <div class="field-grid patient-demographics-grid">
              <label><span>Suffix</span><input name="suffix" placeholder="Suffix"></label>
              <label><span>Patient DOB *</span>
                <div class="dob-input-wrap">
                  <input
                    id="patient-dob-display"
                    type="text"
                    inputmode="numeric"
                    autocomplete="bday"
                    placeholder="mm/dd/yyyy"
                    pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
                    aria-describedby="patient-dob-help"
                    required
                  >
                  <input id="patient-dob-value" type="hidden" name="dob">
                  <button id="patient-dob-trigger" type="button" class="dob-trigger" aria-haspopup="dialog" aria-controls="patient-dob-modal" aria-label="Open patient date of birth selector">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
                  </button>
                </div>
                <small id="patient-dob-help" class="dob-field-help">Select month, day, and year · MM/DD/YYYY</small>
              </label>
              <label class="patient-age-field"><span>Age</span><input type="text" name="age" placeholder="Calculated" readonly></label>
              <label><span>Sex *</span>
                <select name="sex" required>
                  <option value="">Select Sex</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </label>
              <div class="patient-id-field"><span class="field-label">Patient ID</span><p class="patient-id">Auto</p></div>
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
            <div class="field-grid three-col">
              <label><span>Ethnicity</span><input name="ethnicity" placeholder="Select Ethnicity"></label>
              <label><span>Race</span><input name="race" placeholder="Select Race"></label>
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
        <div class="action-left">
          <button type="button" id="registration-clear" class="btn-ghost">${isViewedRequisition ? "Cancel Changes" : "Clear"}</button>
          ${isViewedRequisition ? `<button type="button" id="requisition-reject-order" class="btn-primary btn-danger" ${canRejectViewedOrder ? "" : "disabled"}>Reject Order</button>` : ""}
        </div>
        <div class="action-right">
          ${isViewedRequisition ? `<button type="submit" class="btn-primary dark-submit">Save Changes</button>` : ""}
          <button type="button" id="register-and-order" class="btn-primary dark-submit ghost-submit">Register And Order</button>
        </div>
      </div>
    </form>
    <div id="patient-dob-modal" class="custom-icd-modal patient-dob-modal hidden" role="dialog" aria-modal="true" aria-labelledby="patient-dob-title">
      <div class="custom-icd-dialog patient-dob-dialog">
        <div class="dob-picker-head">
          <span class="dob-picker-head-spacer" aria-hidden="true"></span>
          <div>
            <p class="badge">Patient date of birth</p>
            <h3 id="patient-dob-title">Select date of birth</h3>
          </div>
          <button type="button" id="patient-dob-close" class="custom-icd-close" aria-label="Close date of birth selector">×</button>
        </div>
        <div id="patient-dob-grid" class="dob-picker-grid" role="group" aria-labelledby="patient-dob-title"></div>
        <div class="dob-picker-footer">
          <button type="button" id="patient-dob-clear" class="btn-ghost">Clear date</button>
          <p id="patient-dob-selected" aria-live="polite">No date selected</p>
          <button type="button" id="patient-dob-apply" class="btn-primary">Done</button>
        </div>
      </div>
    </div>
    <div id="custom-provider-modal" class="custom-icd-modal hidden" role="dialog" aria-modal="true" aria-labelledby="custom-provider-title">
      <div class="custom-icd-dialog custom-provider-dialog">
        <div class="custom-icd-head">
          <div>
            <p class="badge">Provider Directory</p>
            <h3 id="custom-provider-title">Add Custom Provider</h3>
          </div>
          <button type="button" class="custom-icd-close" data-custom-provider-cancel aria-label="Close">×</button>
        </div>
        <form id="custom-provider-form" class="custom-icd-body custom-provider-body" novalidate>
          <p class="subtle custom-icd-copy">Add a provider that is missing from the current list. The provider will be saved to the directory and selected for this requisition immediately.</p>
          <div class="custom-icd-code-card">
            <span class="custom-icd-code-label">Linked Facility</span>
            <strong id="custom-provider-facility" class="custom-icd-code-value"></strong>
          </div>
          <div class="field-grid two-col custom-provider-grid">
            <label class="custom-icd-field">
              <span>Provider Name *</span>
              <div class="facility-inline-input custom-provider-name-inline">
                <select id="custom-provider-designation" name="designation">
                  <option value="">No Prefix</option>
                  <option value="Dr.">Dr.</option>
                  <option value="Mr.">Mr.</option>
                  <option value="Ms.">Ms.</option>
                  <option value="Mrs.">Mrs.</option>
                </select>
                <input id="custom-provider-name" name="providerName" type="text" placeholder="Enter provider name" maxlength="120">
              </div>
            </label>
            <label class="custom-icd-field">
              <span>Provider NPI</span>
              <div class="facility-inline-input">
                <input id="custom-provider-npi" name="npi" type="text" inputmode="numeric" placeholder="10 digit NPI" maxlength="20">
                <button type="button" class="btn-primary mini" data-custom-provider-npi-fetch>Fetch</button>
              </div>
            </label>
            <label class="custom-icd-field">
              <span>Display Name</span>
              <input id="custom-provider-display-name" name="displayName" type="text" placeholder="Display Name" maxlength="160">
            </label>
            <label class="custom-icd-field">
              <span>Contact Number</span>
              <input id="custom-provider-contact-no" name="contactNo" type="text" placeholder="Enter Contact Number" maxlength="40">
            </label>
            <label class="custom-icd-field">
              <span>Extension</span>
              <input id="custom-provider-extension" name="extension" type="text" placeholder="Extension" maxlength="20">
            </label>
            <label class="custom-icd-field">
              <span>Email</span>
              <input id="custom-provider-email" name="email" type="email" placeholder="Email" maxlength="160">
            </label>
            <label class="custom-icd-field">
              <span>Alternate Emails</span>
              <input id="custom-provider-alternate-emails" name="alternateEmails" type="text" placeholder="Alternate Emails" maxlength="240">
            </label>
            <label class="custom-icd-field">
              <span>Credential</span>
              <input id="custom-provider-credential" name="credential" type="text" placeholder="Credential" maxlength="40">
            </label>
            <label class="custom-icd-field full">
              <span>DOB</span>
              <div class="facility-inline-input facility-triple-inline">
                <select id="custom-provider-dob-month" name="dobMonth">
                  <option value="">Month</option>
                  ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}
                </select>
                <select id="custom-provider-dob-day" name="dobDay">
                  <option value="">Day</option>
                  ${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}
                </select>
                <select id="custom-provider-dob-year" name="dobYear">
                  <option value="">Year</option>
                  ${Array.from({ length: 80 }, (_, i) => {
                    const year = new Date().getFullYear() - i;
                    return `<option value="${year}">${year}</option>`;
                  }).join("")}
                </select>
              </div>
            </label>
            <label class="custom-icd-field">
              <span>Speciality</span>
              <input id="custom-provider-speciality" name="speciality" type="text" placeholder="Speciality" maxlength="160">
            </label>
            <label class="custom-icd-field">
              <span>Fax Number</span>
              <input id="custom-provider-fax-number" name="faxNumber" type="text" placeholder="Fax Number" maxlength="40">
            </label>
            <label class="custom-icd-field full">
              <span>Mailing Address</span>
              <input id="custom-provider-mailing-address" name="mailingAddress" type="text" placeholder="Mailing Address" maxlength="240">
            </label>
          </div>
          <div class="field-grid three-col custom-provider-grid">
            <label class="custom-icd-field">
              <span>City</span>
              <input id="custom-provider-city" name="city" type="text" placeholder="City" maxlength="120">
            </label>
            <label class="custom-icd-field">
              <span>State</span>
              <input id="custom-provider-state" name="state" type="text" placeholder="State" maxlength="40">
            </label>
            <label class="custom-icd-field">
              <span>Zipcode</span>
              <input id="custom-provider-zipcode" name="zipcode" type="text" placeholder="Zipcode" maxlength="20">
            </label>
          </div>
          <div class="field-grid one-col custom-provider-grid">
            <label class="custom-icd-field">
              <span>Comment</span>
              <input id="custom-provider-comment" name="comment" type="text" placeholder="Comment" maxlength="240">
            </label>
          </div>
          <p id="custom-provider-error" class="error hidden" aria-live="polite"></p>
          <div class="custom-icd-footer">
            <button type="button" class="btn-ghost" data-custom-provider-cancel>Cancel</button>
            <button type="submit" class="btn-primary">Save Provider</button>
          </div>
        </form>
      </div>
    </div>
    <div id="scan-review-modal" class="custom-icd-modal hidden" role="dialog" aria-modal="true" aria-labelledby="scan-review-title">
      <div class="custom-icd-dialog scan-review-dialog">
        <div class="custom-icd-head">
          <div>
            <p class="badge">Scan Review</p>
            <h3 id="scan-review-title">Validate Extracted Requisition Data</h3>
          </div>
          <button type="button" class="custom-icd-close" data-scan-review-cancel aria-label="Close">×</button>
        </div>
        <form id="scan-review-form" class="custom-icd-body scan-review-body" novalidate>
          <div class="scan-review-content">
            <div class="scan-review-summary">
              <div class="scan-review-summary-card">
                <span>Source File</span>
                <strong id="scan-review-file">Scanned requisition</strong>
              </div>
              <div class="scan-review-summary-card">
                <span>Detected Fields</span>
                <strong id="scan-review-count">0 fields</strong>
              </div>
            </div>
            <p class="subtle scan-review-copy">Review and edit the extracted values below. Nothing will be copied into the requisition form until you click Validate.</p>
            <div id="scan-review-sections" class="scan-review-sections"></div>
            <p id="scan-review-error" class="error hidden" aria-live="polite"></p>
          </div>
          <div class="custom-icd-footer scan-review-footer">
            <button type="button" class="btn-ghost" data-scan-review-cancel>Cancel</button>
            <button type="submit" class="btn-primary">Validate And Autofill</button>
          </div>
        </form>
      </div>
    </div>
    <div id="scan-upload-modal" class="custom-icd-modal hidden" role="dialog" aria-modal="true" aria-labelledby="scan-upload-title">
      <div class="custom-icd-dialog scan-upload-dialog">
        <div class="custom-icd-head">
          <div>
            <p class="badge">Scan Import</p>
            <h3 id="scan-upload-title">Upload Scan Copy</h3>
          </div>
          <button type="button" class="custom-icd-close" data-scan-upload-cancel aria-label="Close">×</button>
        </div>
        <div class="custom-icd-body scan-upload-body">
          <p class="subtle scan-upload-copy">Upload a scanned requisition PDF or image. We will extract the data first, then show you a validation popup before anything is copied into the requisition form.</p>
          <div class="scan-upload-panel">
            <input id="scan-upload-file" class="hidden" type="file" accept=".pdf,image/png,image/jpeg,image/jpg,image/heic,image/heif,image/tiff">
            <button type="button" id="scan-upload-select" class="btn-primary">Upload PDF Scan Copy</button>
            <p class="subtle">Supported files: PDF, PNG, JPG, HEIC, HEIF, TIFF.</p>
            <p id="scan-upload-status" class="subtle hidden" aria-live="polite"></p>
          </div>
          <div class="custom-icd-footer scan-upload-footer">
            <button type="button" class="btn-ghost" data-scan-upload-cancel>Cancel</button>
          </div>
        </div>
      </div>
    </div>
    <div id="requisition-change-modal" class="custom-icd-modal hidden" role="dialog" aria-modal="true" aria-labelledby="requisition-change-title">
      <div class="custom-icd-dialog requisition-change-dialog">
        <div class="custom-icd-head">
          <div>
            <p class="badge">Change Approval</p>
            <h3 id="requisition-change-title">Review Requisition Changes</h3>
          </div>
          <button type="button" class="custom-icd-close" data-requisition-change-cancel aria-label="Close">×</button>
        </div>
        <form id="requisition-change-form" class="custom-icd-body requisition-change-body" novalidate>
          <div id="requisition-change-summary" class="requisition-change-summary"></div>
          <label class="custom-icd-field">
            <span>Reason for change *</span>
            <textarea id="requisition-change-reason" rows="3" placeholder="Enter the clinical or operational reason for this requisition change"></textarea>
          </label>
          <label class="scan-review-check requisition-change-approval">
            <input id="requisition-change-approval" type="checkbox">
            <span class="scan-review-check-mark" aria-hidden="true"></span>
            <span><strong>Approve changes</strong><small>I approve publishing these requisition and downstream order changes.</small></span>
          </label>
          <p id="requisition-change-error" class="error hidden" aria-live="polite"></p>
          <div class="custom-icd-footer">
            <button type="button" class="btn-ghost" data-requisition-change-cancel>Cancel</button>
            <button type="submit" class="btn-primary">Approve And Publish Changes</button>
          </div>
        </form>
      </div>
    </div>
    <p id="registration-status" class="subtle"></p>
  `;

  const form = document.getElementById("registration-form");
  const clearBtn = document.getElementById("registration-clear");
  const status = document.getElementById("registration-status");
  const requisitionAuditEventsNode = document.getElementById("requisition-audit-events");
  const registerAndOrderBtn = document.getElementById("register-and-order");
  const patientDobValueInput = document.getElementById("patient-dob-value");
  const patientDobDisplayInput = document.getElementById("patient-dob-display");
  const patientDobTrigger = document.getElementById("patient-dob-trigger");
  const patientDobModal = document.getElementById("patient-dob-modal");
  const patientDobGrid = document.getElementById("patient-dob-grid");
  const patientDobTitle = document.getElementById("patient-dob-title");
  const patientDobClose = document.getElementById("patient-dob-close");
  const patientDobClear = document.getElementById("patient-dob-clear");
  const patientDobSelected = document.getElementById("patient-dob-selected");
  const patientDobApply = document.getElementById("patient-dob-apply");
  const registrationSubmissionId = createSubmissionId("requisition");
  const registerAndOrderLabel = registerAndOrderBtn?.textContent || "Register And Order";
  let registrationSubmitInFlight = false;
  const setRegistrationSubmitBusy = (isBusy) => {
    if (!registerAndOrderBtn) return;
    registerAndOrderBtn.disabled = isBusy;
    registerAndOrderBtn.setAttribute("aria-busy", isBusy ? "true" : "false");
    registerAndOrderBtn.textContent = isBusy ? "Creating Requisition..." : registerAndOrderLabel;
  };
  const facilityComboboxNode = document.getElementById("req-facility-combobox");
  const facilityNameInput = document.getElementById("req-facility-name");
  const facilityToggleBtn = document.getElementById("req-facility-toggle");
  const facilityResultsNode = document.getElementById("req-facility-results");
  const providerComboboxNode = document.getElementById("req-provider-combobox");
  const providerNameInput = document.getElementById("req-provider-name");
  const providerToggleBtn = document.getElementById("req-provider-toggle");
  const providerResultsNode = document.getElementById("req-provider-results");
  const providerNpiInput = document.getElementById("req-provider-npi");
  const addProviderBtn = document.getElementById("req-add-provider");
  const customProviderModalNode = document.getElementById("custom-provider-modal");
  const customProviderForm = document.getElementById("custom-provider-form");
  const customProviderFacilityNode = document.getElementById("custom-provider-facility");
  const customProviderDesignationInput = document.getElementById("custom-provider-designation");
  const customProviderNameInput = document.getElementById("custom-provider-name");
  const customProviderDisplayNameInput = document.getElementById("custom-provider-display-name");
  const customProviderNpiInput = document.getElementById("custom-provider-npi");
  const customProviderErrorNode = document.getElementById("custom-provider-error");
  const scanReviewModalNode = document.getElementById("scan-review-modal");
  const scanReviewForm = document.getElementById("scan-review-form");
  const scanReviewFileNode = document.getElementById("scan-review-file");
  const scanReviewCountNode = document.getElementById("scan-review-count");
  const scanReviewSectionsNode = document.getElementById("scan-review-sections");
  const scanReviewErrorNode = document.getElementById("scan-review-error");
  const scanUploadModalNode = document.getElementById("scan-upload-modal");
  const scanUploadFileInput = document.getElementById("scan-upload-file");
  const scanUploadSelectBtn = document.getElementById("scan-upload-select");
  const scanUploadStatusNode = document.getElementById("scan-upload-status");
  const scanUploadCancelButtons = Array.from(panelBody.querySelectorAll("[data-scan-upload-cancel]"));
  const requisitionChangeModalNode = document.getElementById("requisition-change-modal");
  const requisitionChangeForm = document.getElementById("requisition-change-form");
  const requisitionChangeSummaryNode = document.getElementById("requisition-change-summary");
  const requisitionChangeReasonInput = document.getElementById("requisition-change-reason");
  const requisitionChangeApprovalInput = document.getElementById("requisition-change-approval");
  const requisitionChangeErrorNode = document.getElementById("requisition-change-error");
  const requisitionChangeCancelButtons = Array.from(panelBody.querySelectorAll("[data-requisition-change-cancel]"));
  const searchInput = document.getElementById("patient-search");
  const searchClear = document.getElementById("search-clear");
  const searchResults = document.getElementById("search-results");
  const modifyRequisitionBtn = document.getElementById("req-modify-toggle");
  const rejectRequisitionOrderBtn = document.getElementById("requisition-reject-order");
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
  const requisitionScanTrigger = document.getElementById("requisition-scan-trigger");
  const sectionCollapseToggles = Array.from(form.querySelectorAll("[data-collapse-target]"));
  const allPatients = getSearchablePatients();
  let activeResults = [];
  let selectedIndex = -1;
  let activeCustomProviderResolver = null;
  let activeScanReviewResolver = null;
  let scanUploadInFlight = false;
  let activeScanReviewFieldKeys = [];
  let activeRequisitionChangeResolver = null;
  let facilityMatchResults = [];
  let activeFacilityMatchIndex = -1;
  let providerMatchResults = [];
  let activeProviderMatchIndex = -1;
  let patientDobPicker = null;

  attachRequisitionTabEvents();

  if (requisitionAuditEventsNode && sourceOrder?.orderId) {
    requestJson(`/api/portal/orders/${encodeURIComponent(sourceOrder.orderId)}/audit-events`)
      .then((payload) => {
        requisitionAuditEventsNode.innerHTML = renderAuditTimeline(Array.isArray(payload?.events) ? payload.events : []);
      })
      .catch(() => {
        requisitionAuditEventsNode.innerHTML = renderAuditTimeline();
      });
  }

  function setRequisitionViewLock(isLocked) {
    form.querySelectorAll("input, select, textarea, button").forEach((node) => {
      node.disabled = Boolean(isLocked);
    });
    if (rejectRequisitionOrderBtn) rejectRequisitionOrderBtn.disabled = !canRejectViewedOrder;
    [searchInput, searchClear, requisitionScanTrigger, facilityToggleBtn, providerToggleBtn, addProviderBtn].forEach((node) => {
      if (node) node.disabled = Boolean(isLocked);
    });
    panelBody.querySelector(".requisition-form")?.classList.toggle("is-read-only", Boolean(isLocked));
  }

  modifyRequisitionBtn?.addEventListener("click", () => {
    if (!canModifyViewedRequisition) return;
    renderRegistration(prefillData, { sourceOrder, mode: "modify" });
  });

  rejectRequisitionOrderBtn?.addEventListener("click", async () => {
    const orderId = String(sourceOrder?.orderId || "").trim();
    if (!orderId || rejectRequisitionOrderBtn.disabled) return;
    rejectRequisitionOrderBtn.disabled = true;
    status.textContent = `Rejecting Order #${orderId}...`;
    try {
      const rejectedOrder = await rejectOrderWithConfirmation(orderId);
      if (!rejectedOrder) {
        status.textContent = "Order rejection canceled.";
        rejectRequisitionOrderBtn.disabled = !canRejectOrder(sourceOrder);
        return;
      }
      sourceOrder = rejectedOrder;
      renderRegistration(prefillData, {
        sourceOrder: rejectedOrder,
        mode: "view",
        originalSourceOrder,
        originalRecord: originalRequisitionRecord,
      });
    } catch (error) {
      status.textContent = error?.message || "Unable to reject this order.";
      rejectRequisitionOrderBtn.disabled = !canRejectOrder(sourceOrder);
    }
  });

  function renderRequisitionChangePlanMarkup(plan, replacementAccession = "") {
    const registrationItems = plan.registrationChanges.length
      ? plan.registrationChanges.map((label) => `<li>${escapeHtml(label)}</li>`).join("")
      : "<li>No demographic or billing fields changed.</li>";
    const panelText = plan.panelChanged
      ? `${plan.originalPanelLabels.join(", ") || "None"} -> ${plan.draftPanelLabels.join(", ") || "None"}`
      : "No panel changes.";
    const icdText = plan.icdChanged
      ? `${plan.originalIcdCodes.map(formatIcdCode).join(", ") || "None"} -> ${plan.draftIcdCodes.map(formatIcdCode).join(", ") || "None"}`
      : "No ICD code changes.";
    const pathogenText = plan.pathogenChanged
      ? `${plan.originalPathogens.join(", ") || "None"} -> ${plan.draftPathogens.join(", ") || "None"}`
      : "No pathogen selection changes.";
    const orderImpact = plan.orderAction === "replace"
      ? `
        <li>Dismiss existing Order #${escapeHtml(sourceOrder?.orderId || "-")} with accession ${escapeHtml(plan.originalAccession || "-")}.</li>
        <li>Create a replacement pending order${replacementAccession ? ` with accession ${escapeHtml(replacementAccession)}` : " with a new accession"}.</li>
      `
      : `<li>Update existing pending Order #${escapeHtml(sourceOrder?.orderId || "-")} in place.</li>`;
    return `
      <section class="requisition-change-card">
        <h4>Requisition Fields</h4>
        <ul>${registrationItems}</ul>
      </section>
      <section class="requisition-change-card">
        <h4>Panels</h4>
        <p>${escapeHtml(panelText)}</p>
      </section>
      <section class="requisition-change-card">
        <h4>ICD Codes</h4>
        <p>${escapeHtml(icdText)}</p>
      </section>
      <section class="requisition-change-card">
        <h4>Pathogens to Test</h4>
        <p>${escapeHtml(pathogenText)}</p>
      </section>
      <section class="requisition-change-card">
        <h4>Downstream Order Impact</h4>
        <ul>${orderImpact}</ul>
      </section>
    `;
  }

  function closeRequisitionChangeModal(result = null) {
    requisitionChangeModalNode?.classList.add("hidden");
    document.body.classList.remove("modal-open");
    const resolver = activeRequisitionChangeResolver;
    activeRequisitionChangeResolver = null;
    if (resolver) resolver(result);
  }
  function openRequisitionChangeModal(plan, replacementAccession = "") {
    if (!requisitionChangeModalNode || !requisitionChangeSummaryNode) return Promise.resolve(null);
    requisitionChangeSummaryNode.innerHTML = renderRequisitionChangePlanMarkup(plan, replacementAccession);
    if (requisitionChangeReasonInput) requisitionChangeReasonInput.value = "";
    if (requisitionChangeApprovalInput) requisitionChangeApprovalInput.checked = false;
    if (requisitionChangeErrorNode) {
      requisitionChangeErrorNode.textContent = "";
      requisitionChangeErrorNode.classList.add("hidden");
    }
    requisitionChangeModalNode.classList.remove("hidden");
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => requisitionChangeReasonInput?.focus());
    return new Promise((resolve) => {
      activeRequisitionChangeResolver = resolve;
    });
  }

  requisitionChangeCancelButtons.forEach((button) => {
    button.addEventListener("click", () => closeRequisitionChangeModal(null));
  });

  requisitionChangeModalNode?.addEventListener("click", (event) => {
    if (event.target === requisitionChangeModalNode) closeRequisitionChangeModal(null);
  });

  requisitionChangeModalNode?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeRequisitionChangeModal(null);
    }
  });

  requisitionChangeForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const reason = String(requisitionChangeReasonInput?.value || "").trim();
    const approved = Boolean(requisitionChangeApprovalInput?.checked);
    if (!reason || !approved) {
      if (requisitionChangeErrorNode) {
        requisitionChangeErrorNode.textContent = !reason
          ? "Enter a reason for the requisition change."
          : "Approve publishing these changes before continuing.";
        requisitionChangeErrorNode.classList.remove("hidden");
      }
      return;
    }
    closeRequisitionChangeModal({ reason, approved });
  });

  function getOrderFieldsFromRequisitionData(data) {
    const patientName = `${data.firstName || ""} ${data.middleName || ""} ${data.lastName || ""}`.replace(/\s+/g, " ").trim();
    return {
      patientId: data.patientId || "",
      patientName,
      patientDob: data.dob || "",
      provider: data.provider || "",
      facilityName: data.facilityName || "",
      specimenTypeSwab: data.specimenTypeSwab || "",
      specimenTypeWound: data.specimenTypeWound || "",
      specimenTypeWoundLocation: data.specimenTypeWoundLocation || "",
      specimenTypeOther: data.specimenTypeOther || "",
      specimenTypeOtherText: data.specimenTypeOtherText || "",
    };
  }

  function readRequisitionFormData() {
    const data = Object.fromEntries(new FormData(form).entries());
    [
      "specimenTypeSwab",
      "specimenTypeWound",
      "specimenTypeWoundLocation",
      "specimenTypeOther",
      "specimenTypeOtherText",
    ].forEach((fieldName) => {
      if (!Object.prototype.hasOwnProperty.call(data, fieldName)) data[fieldName] = "";
    });
    return data;
  }

  async function publishApprovedRequisitionChanges(data, plan, approval) {
    const approvedAt = new Date().toISOString();
    const reason = String(approval?.reason || "").trim();
    const orderFields = getOrderFieldsFromRequisitionData(data);
    const changeMeta = {
      reason,
      approvedAt,
      approvedBy: activeSession?.username || activeSession?.email || activeSession?.type || "clinician",
      previousOrderId: originalSourceOrder?.orderId || "",
      previousAccession: plan.originalAccession || "",
      action: plan.orderAction,
    };

    const registrationPayload = {
      ...(prefillData || {}),
      ...data,
      requisitionChange: changeMeta,
      updatedAt: approvedAt,
    };
    await saveRegistrationData(registrationPayload);

    if (plan.orderAction === "replace") {
      const reservedOrderIds = await allocateOrderIds(1);
      const replacementOrderId = String(reservedOrderIds?.[0] || "").trim();
      if (!replacementOrderId) throw new Error("Unable to reserve a replacement order ID.");
      const replacementServiceLine = Array.isArray(sourceOrder?.services) ? sourceOrder.services[0] : null;
      const replacementOrder = {
        ...sourceOrder,
        ...orderFields,
        orderId: replacementOrderId,
        status: "Pending",
        createdAt: approvedAt,
        updatedAt: approvedAt,
        accessionPrefix: resolvePanelPrefixFromService(replacementServiceLine),
        accessionNo: buildAccessionNumber({
          serviceLine: replacementServiceLine,
          orderDate: sourceOrder?.sampleCollectTime || approvedAt,
          orderId: replacementOrderId,
        }),
        requisitionChange: {
          ...changeMeta,
          replacedOrderId: originalSourceOrder?.orderId || "",
        },
      };

      await updateOrderById(originalSourceOrder.orderId, (row) => ({
        ...row,
        status: "Dismissed",
        dismissedAt: approvedAt,
        dismissedReason: reason,
        supersededByOrderId: replacementOrderId,
        requisitionChange: {
          ...changeMeta,
          replacementOrderId,
        },
        updatedAt: approvedAt,
      }));
      await saveOrderRecords([replacementOrder]);
      return replacementOrder;
    }

    const updatedOrder = {
      ...sourceOrder,
      ...orderFields,
      status: "Pending",
      accessionPrefix: resolvePanelPrefixFromService(Array.isArray(sourceOrder?.services) ? sourceOrder.services[0] : null),
      accessionNo: String(sourceOrder?.accessionNo || sourceOrder?.accession || "").trim() || plan.originalAccession || "",
      requisitionChange: changeMeta,
      updatedAt: approvedAt,
    };
    const saved = await updateOrderById(sourceOrder.orderId, () => updatedOrder);
    if (!saved) throw new Error("Unable to update the linked pending order.");
    return readOrders().find((order) => String(order?.orderId || "") === String(sourceOrder?.orderId || "")) || updatedOrder;
  }

  panelBody.querySelector(".req-selected-summary")?.addEventListener("click", (event) => {
    const editor = panelBody.querySelector("[data-req-icd-editor]");

    if (event.target.closest("[data-req-icd-edit]")) {
      if (!editor) return;
      editor.classList.remove("hidden");
      editor.querySelector("[data-req-icd-search]")?.focus();
      return;
    }

    if (event.target.closest("[data-req-icd-cancel]")) {
      if (!editor) return;
      editor.classList.add("hidden");
      return;
    }

    const addBtn = event.target.closest("[data-req-add-icd-code]");
    if (addBtn) {
      if (!editor) return;
      const code = normalizeIcdCode(addBtn.getAttribute("data-req-add-icd-code") || "");
      const selectedCodes = getSelectedRequisitionIcdCodes(editor);
      if (code && !selectedCodes.includes(code)) selectedCodes.push(code);
      const selectedNode = editor.querySelector("[data-req-icd-selected]");
      if (selectedNode) selectedNode.innerHTML = renderRequisitionIcdEditorRows(selectedCodes);
      refreshRequisitionIcdEditor(editor);
      return;
    }

    const panelEditor = panelBody.querySelector("[data-req-panel-editor]");
    if (event.target.closest("[data-req-panel-edit]")) {
      if (!panelEditor) return;
      panelEditor.classList.remove("hidden");
      return;
    }

    if (event.target.closest("[data-req-panel-cancel]")) {
      if (!panelEditor) return;
      panelEditor.classList.add("hidden");
    }
  });

  panelBody.querySelector("[data-req-icd-editor]")?.addEventListener("input", (event) => {
    if (event.target.matches("[data-req-icd-search]")) {
      refreshRequisitionIcdEditor(event.currentTarget);
    }
  });

  panelBody.querySelector("[data-req-icd-editor]")?.addEventListener("change", (event) => {
    if (event.target.matches("[data-req-edit-icd-code]")) {
      refreshRequisitionIcdEditor(event.currentTarget);
    }
  });

  panelBody.querySelector("[data-req-icd-editor]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const editor = event.currentTarget;
    const statusNode = editor.querySelector("[data-req-icd-status]");
    const orderId = String(editor.getAttribute("data-order-id") || sourceOrder?.orderId || "").trim();
    if (!orderId) {
      if (statusNode) statusNode.textContent = "Unable to locate the saved order.";
      return;
    }
    try {
      if (statusNode) statusNode.textContent = "Applying ICD code changes to draft...";
      const selectedCodes = getSelectedRequisitionIcdCodes(editor);
      const nextOrder = buildOrderWithIcdCodes(sourceOrder, selectedCodes);
      if (!nextOrder) throw new Error("Unable to apply ICD codes to this order.");
      sourceOrder = nextOrder;
      const currentDraftRecord = { ...(prefillData || {}), ...readRequisitionFormData() };
      currentDraftRecord.patientId = patientIdNode.textContent.trim() || currentDraftRecord.patientId || "";
      renderRegistration(currentDraftRecord, { sourceOrder, mode: requisitionMode, originalSourceOrder, originalRecord: originalRequisitionRecord });
    } catch (error) {
      if (statusNode) statusNode.textContent = error?.message || "Unable to apply ICD codes.";
    }
  });

  panelBody.querySelector("[data-req-panel-editor]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const editor = event.currentTarget;
    const statusNode = editor.querySelector("[data-req-panel-status]");
    const orderId = String(editor.getAttribute("data-order-id") || sourceOrder?.orderId || "").trim();
    if (!orderId) {
      if (statusNode) statusNode.textContent = "Unable to locate the saved order.";
      return;
    }
    try {
      if (statusNode) statusNode.textContent = "Applying panel changes to draft...";
      const selectedPanelIds = Array.from(editor.querySelectorAll("[data-req-edit-panel-id]:checked"))
        .map((input) => input.getAttribute("data-req-edit-panel-id") || "")
        .filter(Boolean);
      if (!selectedPanelIds.length) throw new Error("Select at least one panel before saving.");
      const nextOrder = buildOrderWithPanels(sourceOrder, selectedPanelIds);
      if (!nextOrder) throw new Error("Select at least one valid panel before saving.");
      sourceOrder = nextOrder;
      const currentDraftRecord = { ...(prefillData || {}), ...readRequisitionFormData() };
      currentDraftRecord.patientId = patientIdNode.textContent.trim() || currentDraftRecord.patientId || "";
      renderRegistration(currentDraftRecord, { sourceOrder, mode: requisitionMode, originalSourceOrder, originalRecord: originalRequisitionRecord });
    } catch (error) {
      if (statusNode) statusNode.textContent = error?.message || "Unable to apply panels.";
    }
  });

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
      referenceLab: normalizedValues.referenceLab || "",
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
    refreshFacilityAutocomplete(nextFacility);
    const matchedProvider = refreshProviderAutocomplete(facilityNameInput?.value || nextFacility, nextProvider);
    if (providerNpiInput) {
      providerNpiInput.value = String(matchedProvider?.npi || normalizedValues.providerNpi || "").trim();
    }

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

    patientDobPicker?.syncFromValue();
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

  function normalizeFacilitySearch(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeProviderSearch(value) {
    return String(value || "").trim().toLowerCase();
  }

  function setFacilityResultsExpanded(isExpanded) {
    const expanded = Boolean(isExpanded);
    facilityComboboxNode?.setAttribute("aria-expanded", String(expanded));
    facilityNameInput?.setAttribute("aria-expanded", String(expanded));
  }

  function setProviderResultsExpanded(isExpanded) {
    const expanded = Boolean(isExpanded);
    providerComboboxNode?.setAttribute("aria-expanded", String(expanded));
    providerNameInput?.setAttribute("aria-expanded", String(expanded));
  }

  function getFacilitySearchOptions(preferredFacility = "") {
    const selectedFacility = String(preferredFacility || "").trim();
    const options = getFacilityAccountOptions().map((value) => {
      const account = findFacilityAccountRecord(value);
      const accountCode = String(account?.account_code || account?.id || "").trim();
      const email = String(account?.email || account?.basic_information?.email || "").trim();
      const metaParts = [accountCode ? `Code ${accountCode}` : "", email].filter(Boolean);
      return {
        value,
        label: value,
        meta: metaParts.join(" • "),
      };
    });
    if (selectedFacility && !findFacilityAccountRecord(selectedFacility)) {
      options.unshift({
        value: selectedFacility,
        label: selectedFacility,
        meta: "Custom facility",
        isFallback: true,
      });
    }
    return options;
  }

  function findExactFacilityMatch(value) {
    const rawValue = String(value || "").trim();
    const account = findFacilityAccountRecord(rawValue);
    if (!account) {
      const needle = normalizeFacilitySearch(rawValue);
      if (!needle) return null;
      return (
        getFacilitySearchOptions(rawValue).find((item) => {
          const candidates = [item.value, item.label].map(normalizeFacilitySearch).filter(Boolean);
          return candidates.includes(needle);
        }) || null
      );
    }

    const resolvedValue = getFacilityAccountDisplayValue(account);
    const accountCode = String(account?.account_code || account?.id || "").trim();
    const email = String(account?.email || account?.basic_information?.email || "").trim();
    const metaParts = [accountCode ? `Code ${accountCode}` : "", email].filter(Boolean);
    return {
      value: resolvedValue,
      label: resolvedValue,
      meta: metaParts.join(" • "),
    };
  }

  function resolveFacilityMatchFromInput(value) {
    const rawValue = String(value || "").trim();
    if (!rawValue) return null;

    const exactMatch = findExactFacilityMatch(rawValue);
    if (exactMatch) return exactMatch;

    const needle = normalizeFacilitySearch(rawValue);
    const matches = getFacilitySearchOptions(rawValue).filter((item) =>
      `${item.value} ${item.label} ${item.meta}`.toLowerCase().includes(needle)
    );
    return matches.length === 1 ? matches[0] : null;
  }

  function getFilteredFacilityMatches(query = "") {
    const needle = normalizeFacilitySearch(query);
    const options = getFacilitySearchOptions(facilityNameInput?.value || "");
    const matches = needle
      ? options.filter((item) => `${item.value} ${item.label} ${item.meta}`.toLowerCase().includes(needle))
      : options;
    return matches.slice(0, 8);
  }

  function hideFacilityResults() {
    facilityMatchResults = [];
    activeFacilityMatchIndex = -1;
    if (facilityResultsNode) {
      facilityResultsNode.innerHTML = "";
      facilityResultsNode.classList.add("hidden");
    }
    setFacilityResultsExpanded(false);
  }

  function renderFacilityResults(query = facilityNameInput?.value || "", { forceOpen = false } = {}) {
    if (!facilityResultsNode || !facilityNameInput) return;

    const rawQuery = String(query || "");
    const trimmedQuery = rawQuery.trim();
    const matches = getFilteredFacilityMatches(trimmedQuery);
    const shouldShow = forceOpen || Boolean(trimmedQuery) || document.activeElement === facilityNameInput;

    facilityMatchResults = matches;
    if (!matches.length) {
      activeFacilityMatchIndex = -1;
    } else if (activeFacilityMatchIndex < 0 || activeFacilityMatchIndex >= matches.length) {
      activeFacilityMatchIndex = 0;
    }

    if (!shouldShow) {
      hideFacilityResults();
      return;
    }

    const resultMarkup = matches
      .map((item, index) => {
        const isActive = index === activeFacilityMatchIndex;
        const metaText = item.meta || "Facility directory";
        return `
          <button
            type="button"
            class="provider-result-btn ${isActive ? "active" : ""}"
            data-facility-match-index="${index}"
            role="option"
            aria-selected="${isActive ? "true" : "false"}"
          >
            <div class="provider-result-top">
              <strong>${escapeHtml(item.value)}</strong>
            </div>
            <span class="provider-result-meta">${escapeHtml(metaText)}</span>
          </button>
        `;
      })
      .join("");

    const emptyMarkup =
      !matches.length
        ? `<p class="provider-results-empty">${escapeHtml(trimmedQuery ? "No matching facilities found." : "No facilities available yet.")}</p>`
        : "";

    facilityResultsNode.innerHTML = `${resultMarkup}${emptyMarkup}`;
    facilityResultsNode.classList.remove("hidden");
    setFacilityResultsExpanded(true);
  }

  function selectFacilityMatch(match, { hideResultsAfterSelect = true, focusNextField = false } = {}) {
    if (!facilityNameInput || !match) return false;
    facilityNameInput.value = String(match.value || "").trim();
    refreshProviderAutocomplete(facilityNameInput.value, providerNameInput?.value || "");
    if (hideResultsAfterSelect) {
      hideFacilityResults();
    } else {
      renderFacilityResults(facilityNameInput.value, { forceOpen: true });
    }
    if (focusNextField) {
      requestAnimationFrame(() => {
        focusNextRequisitionField(facilityNameInput, providerNameInput);
      });
    }
    return true;
  }

  function refreshFacilityAutocomplete(preferredFacility = "") {
    if (!facilityNameInput) return null;
    const nextFacility = String(preferredFacility || "").trim();
    const match = nextFacility ? findExactFacilityMatch(nextFacility) : null;
    facilityNameInput.value = match ? match.value : nextFacility;
    hideFacilityResults();
    return match;
  }

  function getProviderSearchOptions(selectedFacility = "", preferredProvider = "") {
    const nextFacility = String(selectedFacility || "").trim();
    const selectedProvider = String(preferredProvider || "").trim();
    const options = getFacilityProviderOptions(nextFacility).map((item) => ({ ...item }));
    const includeSelectedFallback =
      !nextFacility && selectedProvider && !options.some((item) => item.value === selectedProvider);
    if (includeSelectedFallback) {
      options.unshift({
        value: selectedProvider,
        label: selectedProvider,
        npi: "",
        isLinked: true,
        isFallback: true,
      });
    }
    return options;
  }

  function findExactProviderMatch(value, selectedFacility = "") {
    const needle = normalizeProviderSearch(value);
    if (!needle) return null;
    return (
      getProviderSearchOptions(selectedFacility, value).find((item) => {
        const candidates = [item.value, item.label, item.npi].map(normalizeProviderSearch).filter(Boolean);
        return candidates.includes(needle);
      }) || null
    );
  }

  function resolveProviderMatchFromInput(value, selectedFacility = "") {
    const rawValue = String(value || "").trim();
    if (!rawValue) return null;

    const exactMatch = findExactProviderMatch(rawValue, selectedFacility);
    if (exactMatch) return exactMatch;

    const query = normalizeProviderSearch(rawValue);
    const matches = getProviderSearchOptions(selectedFacility, value).filter((item) =>
      `${item.value} ${item.label} ${item.npi}`.toLowerCase().includes(query)
    );
    return matches.length === 1 ? matches[0] : null;
  }

  function getFilteredProviderMatches(query = "", selectedFacility = "") {
    const needle = normalizeProviderSearch(query);
    const options = getProviderSearchOptions(selectedFacility, providerNameInput?.value || "");
    const matches = needle
      ? options.filter((item) => `${item.value} ${item.label} ${item.npi}`.toLowerCase().includes(needle))
      : options;
    return matches.slice(0, 8);
  }

  function hideProviderResults() {
    providerMatchResults = [];
    activeProviderMatchIndex = -1;
    if (providerResultsNode) {
      providerResultsNode.innerHTML = "";
      providerResultsNode.classList.add("hidden");
    }
    setProviderResultsExpanded(false);
  }

  function getCustomProviderDraft(query = providerNameInput?.value || "") {
    const rawValue = String(query || "").trim();
    const digits = rawValue.replace(/\D/g, "").slice(0, 10);
    const hasLetters = /[A-Za-z]/.test(rawValue);
    return {
      providerName: hasLetters ? rawValue : "",
      providerNpi: !hasLetters && digits.length === 10 ? digits : "",
    };
  }

  function renderProviderResults(query = providerNameInput?.value || "", { forceOpen = false } = {}) {
    if (!providerResultsNode || !providerNameInput) return;

    const rawQuery = String(query || "");
    const trimmedQuery = rawQuery.trim();
    const selectedFacility = String(facilityNameInput?.value || "").trim();
    const exactMatch = findExactProviderMatch(trimmedQuery, selectedFacility);
    const matches = getFilteredProviderMatches(trimmedQuery, selectedFacility);
    const showCustomAdd = activeSession.type === "doctor" && Boolean(trimmedQuery) && !exactMatch;
    const shouldShow = forceOpen || Boolean(trimmedQuery) || document.activeElement === providerNameInput;

    providerMatchResults = matches;
    if (!matches.length) {
      activeProviderMatchIndex = -1;
    } else if (activeProviderMatchIndex < 0 || activeProviderMatchIndex >= matches.length) {
      activeProviderMatchIndex = 0;
    }

    if (!shouldShow) {
      hideProviderResults();
      return;
    }

    const resultMarkup = matches
      .map((item, index) => {
        const isActive = index === activeProviderMatchIndex;
        return `
          <button
            type="button"
            class="provider-result-btn ${isActive ? "active" : ""}"
            data-provider-match-index="${index}"
            role="option"
            aria-selected="${isActive ? "true" : "false"}"
          >
            <div class="provider-result-top">
              <strong>${escapeHtml(item.value)}</strong>
              <span>${escapeHtml(item.npi ? `NPI ${item.npi}` : "NPI not set")}</span>
            </div>
            <span class="provider-result-meta">${escapeHtml(item.isLinked ? "Linked to selected facility" : "Available in provider directory")}</span>
          </button>
        `;
      })
      .join("");

    const emptyMarkup =
      !matches.length
        ? `<p class="provider-results-empty">${escapeHtml(trimmedQuery ? "No matching providers found." : "No providers available yet.")}</p>`
        : "";

    const customAddMarkup =
      showCustomAdd
        ? `
            <button type="button" class="picker-custom-add-btn provider-custom-add-btn" data-provider-add-custom>
              <span class="picker-custom-add-badge">New</span>
              <strong>Add custom provider ${escapeHtml(trimmedQuery)}</strong>
              <span>Save this provider to the directory and use it in this requisition.</span>
            </button>
          `
        : "";

    providerResultsNode.innerHTML = `${resultMarkup}${emptyMarkup}${customAddMarkup}`;
    providerResultsNode.classList.remove("hidden");
    setProviderResultsExpanded(true);
  }

  function selectProviderMatch(match, { hideResultsAfterSelect = true, focusNextField = false } = {}) {
    if (!providerNameInput || !match) return false;
    providerNameInput.value = String(match.value || "").trim();
    if (providerNpiInput) providerNpiInput.value = String(match.npi || "").trim();
    if (hideResultsAfterSelect) {
      hideProviderResults();
    } else {
      renderProviderResults(providerNameInput.value, { forceOpen: true });
    }
    if (focusNextField) {
      requestAnimationFrame(() => {
        focusNextRequisitionField(providerNameInput);
      });
    }
    return true;
  }

  function syncProviderNpiFromInput({ allowLooseResolve = false } = {}) {
    if (!providerNameInput || !providerNpiInput) return null;
    const selectedFacility = String(facilityNameInput?.value || "").trim();
    const match = allowLooseResolve
      ? resolveProviderMatchFromInput(providerNameInput.value, selectedFacility)
      : findExactProviderMatch(providerNameInput.value, selectedFacility);
    providerNpiInput.value = match?.npi || "";
    return match;
  }

  function refreshProviderAutocomplete(selectedFacility = "", preferredProvider = "") {
    if (!providerNameInput) return null;
    const nextFacility = String(selectedFacility || "").trim();
    const nextProvider = String(preferredProvider || "").trim();
    const match = nextProvider ? findExactProviderMatch(nextProvider, nextFacility) : null;
    const shouldKeepFallback = !nextFacility && nextProvider;
    providerNameInput.value = match ? match.value : shouldKeepFallback ? nextProvider : "";
    if (providerNpiInput) providerNpiInput.value = match?.npi || "";
    hideProviderResults();
    return match;
  }

  function setCustomProviderModalError(message) {
    if (!customProviderErrorNode) return;
    const text = String(message || "").trim();
    customProviderErrorNode.textContent = text;
    customProviderErrorNode.classList.toggle("hidden", !text);
  }

  function buildCustomProviderDisplayName() {
    const designation = String(customProviderDesignationInput?.value || "").trim();
    const providerName = String(customProviderNameInput?.value || "").trim();
    return [designation, providerName].filter(Boolean).join(" ").trim();
  }

  function syncCustomProviderDisplayName({ force = false } = {}) {
    if (!customProviderDisplayNameInput) return;
    const nextValue = buildCustomProviderDisplayName();
    const currentValue = String(customProviderDisplayNameInput.value || "").trim();
    const autoValue = String(customProviderDisplayNameInput.dataset.autoValue || "").trim();
    if (!force && currentValue && currentValue !== autoValue) return;
    customProviderDisplayNameInput.value = nextValue;
    customProviderDisplayNameInput.dataset.autoValue = nextValue;
  }

  function closeCustomProviderModal(result = null) {
    if (!activeCustomProviderResolver) return;
    const resolve = activeCustomProviderResolver;
    activeCustomProviderResolver = null;
    customProviderModalNode?.classList.add("hidden");
    document.body.classList.remove("modal-open");
    setCustomProviderModalError("");
    customProviderForm?.reset();
    if (customProviderDisplayNameInput) {
      delete customProviderDisplayNameInput.dataset.autoValue;
    }
    if (customProviderForm instanceof HTMLElement) {
      delete customProviderForm.dataset.lookupSource;
    }
    resolve(result);
  }

  function openCustomProviderModal(defaultValues = {}) {
    if (!customProviderModalNode || !customProviderNameInput || !customProviderFacilityNode) {
      return Promise.resolve(null);
    }

    if (activeCustomProviderResolver) {
      closeCustomProviderModal(null);
    }

    const selectedFacility = String(facilityNameInput?.value || "").trim();
    const parsedProvider = parseProviderDisplayName(defaultValues.providerName || "");
    customProviderForm?.reset();
    if (customProviderForm instanceof HTMLElement) {
      delete customProviderForm.dataset.lookupSource;
    }
    customProviderFacilityNode.textContent = selectedFacility || "Not linked to a specific facility";
    if (customProviderDesignationInput) {
      customProviderDesignationInput.value = parsedProvider.designation || "";
    }
    customProviderNameInput.value = String(parsedProvider.providerName || defaultValues.providerName || "").trim();
    if (customProviderNpiInput) {
      customProviderNpiInput.value = normalizeNpiLookupValue(defaultValues.providerNpi || "");
    }
    syncCustomProviderDisplayName({ force: true });
    setCustomProviderModalError("");
    customProviderModalNode.classList.remove("hidden");
    document.body.classList.add("modal-open");

    return new Promise((resolve) => {
      activeCustomProviderResolver = resolve;
      requestAnimationFrame(() => {
        const focusTarget =
          customProviderNameInput.value.trim()
            ? customProviderNameInput
            : customProviderNpiInput || customProviderNameInput;
        focusTarget?.focus();
        if (focusTarget === customProviderNameInput) {
          customProviderNameInput.select();
        }
      });
    });
  }

  async function createCustomProvider(payload) {
    if (!csrfToken) await fetchCsrfToken();
    return requestJson("/api/facility/providers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify(payload),
    });
  }

  function fileToBase64ForRegistration(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const payload = String(reader.result || "");
        const encoded = payload.includes(",") ? payload.split(",")[1] : payload;
        resolve(encoded || "");
      };
      reader.onerror = () => reject(new Error("Unable to read the selected scan copy."));
      reader.readAsDataURL(file);
    });
  }

  async function requestRequisitionScanAutofillForRegistration(file) {
    if (!csrfToken) await fetchCsrfToken();
    const contentBase64 = await fileToBase64ForRegistration(file);
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

  async function promptForCustomProvider(defaultValues = {}) {
    const submitted = await openCustomProviderModal(defaultValues);
    if (!submitted) return false;

    const selectedFacility = String(facilityNameInput?.value || "").trim();
    const designation = String(submitted.designation || "").trim();
    const providerName = String(submitted.providerName || "").trim();
    const fullProviderName = [designation, providerName].filter(Boolean).join(" ").trim();
    const displayName = String(submitted.displayName || "").trim() || fullProviderName || providerName;
    const providerNpi = String(submitted.providerNpi || "").trim();

    const duplicate = getFacilityProviderOptions(selectedFacility).find((item) => {
      const itemName = String(item.value || "").trim().toLowerCase();
      const sameName =
        itemName === providerName.toLowerCase() ||
        itemName === fullProviderName.toLowerCase() ||
        itemName === displayName.toLowerCase();
      const sameNpi = providerNpi && String(item.npi || "").trim() === providerNpi;
      return sameName || sameNpi;
    });
    if (duplicate) {
      selectProviderMatch(duplicate);
      return true;
    }

    try {
      const result = await createCustomProvider({
        providerInfo: {
          designation,
          providerName,
          displayName,
          contactNo: submitted.contactNo,
          extension: submitted.extension,
          dobMonth: submitted.dobMonth,
          dobDay: submitted.dobDay,
          dobYear: submitted.dobYear,
          email: submitted.email,
          alternateEmails: submitted.alternateEmails,
          credential: submitted.credential,
          npi: providerNpi,
          speciality: submitted.speciality,
          mailingAddress: submitted.mailingAddress,
          city: submitted.city,
          state: submitted.state,
          zipcode: submitted.zipcode,
          faxNumber: submitted.faxNumber,
          comment: submitted.comment,
        },
        configuration: {
          accounts: selectedFacility,
          source: submitted.source || "None (Default)",
        },
        signature: {
          fileName: "",
        },
        loginAccess: {
          accessType: "no_login",
        },
      });

      if (result?.provider) {
        facilityData.providers = [result.provider, ...(facilityData.providers || [])];
        facilityDataLoaded = true;
        refreshProviderAutocomplete(
          selectedFacility,
          result.provider.validator_name || result.provider.display_name || result.provider.provider_name || displayName
        );
        if (providerNpiInput) {
          providerNpiInput.value = String(result.provider.npi || providerNpi || "").trim();
        }
        return true;
      }
    } catch (error) {
      status.textContent = error?.message || "Unable to add provider.";
      return false;
    }

    status.textContent = "Unable to add provider.";
    return false;
  }

  function setScanUploadModalStatus(message = "", tone = "neutral") {
    if (!scanUploadStatusNode) return;
    const text = String(message || "").trim();
    scanUploadStatusNode.textContent = text;
    scanUploadStatusNode.classList.toggle("hidden", !text);
    scanUploadStatusNode.classList.toggle("is-error", tone === "error" && Boolean(text));
    scanUploadStatusNode.classList.toggle("is-success", tone === "success" && Boolean(text));
  }

  function setScanUploadModalBusy(isBusy) {
    scanUploadInFlight = Boolean(isBusy);
    scanUploadModalNode?.classList.toggle("is-busy", scanUploadInFlight);
    if (scanUploadSelectBtn) {
      scanUploadSelectBtn.disabled = scanUploadInFlight;
      scanUploadSelectBtn.textContent = scanUploadInFlight ? "Processing Scan..." : "Upload PDF Scan Copy";
    }
    scanUploadCancelButtons.forEach((button) => {
      button.disabled = scanUploadInFlight;
    });
  }

  function closeScanUploadModal() {
    scanUploadModalNode?.classList.add("hidden");
    document.body.classList.remove("modal-open");
    if (scanUploadFileInput) scanUploadFileInput.value = "";
    setScanUploadModalBusy(false);
    setScanUploadModalStatus("");
  }

  function openScanUploadModal() {
    if (!scanUploadModalNode) return;
    if (scanUploadInFlight) return;
    if (scanUploadFileInput) scanUploadFileInput.value = "";
    setScanUploadModalBusy(false);
    setScanUploadModalStatus("");
    scanUploadModalNode.classList.remove("hidden");
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => {
      scanUploadSelectBtn?.focus();
    });
  }

  function setScanReviewModalError(message) {
    if (!scanReviewErrorNode) return;
    const text = String(message || "").trim();
    scanReviewErrorNode.textContent = text;
    scanReviewErrorNode.classList.toggle("hidden", !text);
  }

  function syncScanReviewDependentFields() {
    if (!scanReviewForm) return;
    activeScanReviewFieldKeys.forEach((fieldKey) => {
      const field = requisitionScanReviewFieldIndex.get(fieldKey);
      if (!field?.dependsOn) return;
      const wrapper = scanReviewForm.querySelector(`[data-scan-review-field="${field.key}"]`);
      if (!wrapper) return;

      const controller = scanReviewForm.elements[field.dependsOn];
      const isVisible =
        controller instanceof HTMLInputElement && controller.type === "checkbox"
          ? controller.checked
          : Boolean(controller && "value" in controller ? controller.value : controller);

      wrapper.classList.toggle("hidden", !isVisible);
      wrapper.querySelectorAll("input, select, textarea").forEach((element) => {
        element.disabled = !isVisible;
      });
    });
  }

  function collectScanReviewValues() {
    const values = {};
    if (!scanReviewForm) return values;

    activeScanReviewFieldKeys.forEach((fieldKey) => {
      const control = scanReviewForm.elements[fieldKey];
      if (!control) return;

      if (control instanceof RadioNodeList) {
        values[fieldKey] = String(control.value || "");
        return;
      }

      if (control instanceof HTMLInputElement && control.type === "checkbox") {
        values[fieldKey] = control.checked ? String(control.value || "on") : "";
        return;
      }

      if (
        (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)
        && control.disabled
      ) {
        values[fieldKey] = "";
        return;
      }

      values[fieldKey] = String(control.value || "");
    });

    return values;
  }

  function closeScanReviewModal(result = null) {
    if (!activeScanReviewResolver) return;
    const resolve = activeScanReviewResolver;
    activeScanReviewResolver = null;
    activeScanReviewFieldKeys = [];
    scanReviewModalNode?.classList.add("hidden");
    document.body.classList.remove("modal-open");
    if (scanReviewSectionsNode) scanReviewSectionsNode.innerHTML = "";
    if (scanReviewFileNode) scanReviewFileNode.textContent = "Scanned requisition";
    if (scanReviewCountNode) scanReviewCountNode.textContent = "0 fields";
    setScanReviewModalError("");
    resolve(result);
  }

  function openScanReviewModal(fileName, payload) {
    if (!scanReviewModalNode || !scanReviewForm || !scanReviewSectionsNode) {
      return Promise.resolve(null);
    }

    if (activeScanReviewResolver) {
      closeScanReviewModal(null);
    }

    const reviewValues = payload?.values && typeof payload.values === "object" ? payload.values : {};
    const reviewMatches = Array.isArray(payload?.matchedFields) ? payload.matchedFields : Object.keys(reviewValues);
    const { markup, fieldKeys } = buildRequisitionScanReviewMarkup(reviewValues, reviewMatches);
    activeScanReviewFieldKeys = fieldKeys;
    scanReviewSectionsNode.innerHTML = markup;
    if (scanReviewFileNode) scanReviewFileNode.textContent = fileName || "Scanned requisition";
    if (scanReviewCountNode) {
      scanReviewCountNode.textContent = `${fieldKeys.length} field${fieldKeys.length === 1 ? "" : "s"}`;
    }
    setScanReviewModalError("");
    scanReviewModalNode.classList.remove("hidden");
    document.body.classList.add("modal-open");
    syncScanReviewDependentFields();

    return new Promise((resolve) => {
      activeScanReviewResolver = resolve;
      requestAnimationFrame(() => {
        const firstField = scanReviewForm.querySelector("input, select, textarea, button");
        if (!firstField) return;
        firstField.focus();
        if (firstField instanceof HTMLInputElement || firstField instanceof HTMLTextAreaElement) {
          firstField.select();
        }
      });
    });
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
    const launchedFromUploadModal = Boolean(scanUploadModalNode && !scanUploadModalNode.classList.contains("hidden"));
    if (requisitionScanTrigger) requisitionScanTrigger.disabled = true;
    status.textContent = `Reading scan copy ${file.name}...`;
    if (launchedFromUploadModal) {
      setScanUploadModalBusy(true);
      setScanUploadModalStatus(`Processing ${file.name}... This can take a few seconds.`, "neutral");
    }

    try {
      const payload = await requestRequisitionScanAutofillForRegistration(file);
      const nextValues = payload?.values || {};
      const matchedCount = Array.isArray(payload?.matchedFields)
        ? payload.matchedFields.length
        : Object.keys(nextValues).length;

      if (!matchedCount) {
        const emptyMessage = payload?.message || "No recognizable requisition fields were found in the scan.";
        status.textContent = emptyMessage;
        if (launchedFromUploadModal) {
          setScanUploadModalStatus(`${emptyMessage} Please try another scan copy.`, "error");
        }
        return;
      }

      if (launchedFromUploadModal) {
        setScanUploadModalStatus(`Extracted ${matchedCount} field${matchedCount === 1 ? "" : "s"}. Opening validation review...`, "success");
        closeScanUploadModal();
      }

      status.textContent = `${file.name} processed. Review the extracted values in the popup and validate them before autofill.`;
      const reviewedValues = await openScanReviewModal(file.name, payload);
      if (reviewedValues == null) {
        status.textContent = `${file.name} processed, but the scan review was canceled. The requisition form was left unchanged.`;
        return;
      }

      applyFormData(reviewedValues);
      syncAgeFromDob();
      tryAutoFillFromZip();
      refreshPatientIdPreview();
      status.textContent = `${file.name} validated. Updated ${matchedCount} scanned field${matchedCount === 1 ? "" : "s"} in the requisition form.`;
    } catch (error) {
      const message = error?.message || "Unable to read the uploaded scan copy.";
      status.textContent = message;
      if (launchedFromUploadModal) {
        setScanUploadModalStatus(message, "error");
      }
    } finally {
      if (requisitionScanTrigger) requisitionScanTrigger.disabled = false;
      if (launchedFromUploadModal && !scanUploadModalNode?.classList.contains("hidden")) {
        setScanUploadModalBusy(false);
        if (scanUploadFileInput) scanUploadFileInput.value = "";
      }
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
    openScanUploadModal();
  });

  if (form.elements.zipcode) {
    form.elements.zipcode.addEventListener("input", tryAutoFillFromZip);
    form.elements.zipcode.addEventListener("blur", tryAutoFillFromZip);
  }

  loadZipCodeDirectory().then(() => {
    tryAutoFillFromZip();
  });

  patientDobPicker = window.LabCenterDobPicker?.createDobPicker({
    valueInput: patientDobValueInput,
    displayInput: patientDobDisplayInput,
    trigger: patientDobTrigger,
    modal: patientDobModal,
    grid: patientDobGrid,
    title: patientDobTitle,
    closeButton: patientDobClose,
    clearButton: patientDobClear,
    selectedLabel: patientDobSelected,
    applyButton: patientDobApply,
    minYear: 1900,
  }) || null;

  if (prefillData) {
    applyFormData(prefillData);
  }
  if (isViewedRequisition && registerAndOrderBtn) {
    registerAndOrderBtn.classList.add("hidden");
  }
  if (isReadOnlyRequisition) {
    setRequisitionViewLock(true);
  }
  syncAgeFromDob();

  const refreshFacilityAutocompleteState = () => {
    const currentFacilityValue = facilityNameInput ? facilityNameInput.value : "";
    const currentProviderValue = providerNameInput ? providerNameInput.value : "";
    refreshFacilityAutocomplete(currentFacilityValue);
    refreshProviderAutocomplete(facilityNameInput?.value || currentFacilityValue, currentProviderValue);
  };
  const requisitionNavigation = window.LabCenterRequisitionNavigation || {};
  const touchedValidationFields = new Set();

  function getRequisitionAdvanceFields() {
    return Array.from(form.querySelectorAll("input, select, textarea"));
  }

  function isAdvanceEligibleField(element) {
    if (!(element instanceof HTMLElement) || !form.contains(element) || element === customAllergyInput) return false;
    if (typeof requisitionNavigation.isAdvanceEligibleField !== "function") return false;
    return Boolean(requisitionNavigation.isAdvanceEligibleField(element));
  }

  function isValidationEligibleField(element) {
    if (!(element instanceof HTMLElement) || !form.contains(element) || element === customAllergyInput) return false;
    if (typeof requisitionNavigation.isValidationEligibleField !== "function") return false;
    return Boolean(requisitionNavigation.isValidationEligibleField(element));
  }

  function getRequisitionValidationFields() {
    return getRequisitionAdvanceFields().filter(isValidationEligibleField);
  }

  function getFieldValidationDecorators(element) {
    if (!(element instanceof HTMLElement)) return [];
    const decorators = [element];
    const row = element.closest(".provider-input-row");
    if (row instanceof HTMLElement) {
      decorators.push(row);
    }
    return decorators;
  }

  function setFieldValidationState(element, state = "neutral") {
    getFieldValidationDecorators(element).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (state === "valid" || state === "invalid") {
        node.dataset.validationState = state;
      } else {
        delete node.dataset.validationState;
      }
    });
  }

  function applyFieldValidationState(element, { markTouched = false, force = false } = {}) {
    if (!isValidationEligibleField(element)) return "neutral";
    if (markTouched) touchedValidationFields.add(element);
    if (!force && !touchedValidationFields.has(element)) return "neutral";
    if (typeof requisitionNavigation.getFieldValidationState !== "function") return "neutral";
    const state = requisitionNavigation.getFieldValidationState(element);
    setFieldValidationState(element, state);
    return state;
  }

  function refreshTouchedFieldValidationState(element) {
    if (!touchedValidationFields.has(element)) return "neutral";
    return applyFieldValidationState(element, { force: true });
  }

  function validateRequisitionFields() {
    getRequisitionValidationFields().forEach((field) => {
      applyFieldValidationState(field, { markTouched: true, force: true });
    });
  }

  function clearRequisitionFieldValidationStates() {
    getRequisitionValidationFields().forEach((field) => {
      touchedValidationFields.delete(field);
      setFieldValidationState(field, "neutral");
    });
  }

  function focusNextRequisitionField(currentField, preferredNextField = null) {
    if (!(currentField instanceof HTMLElement) || typeof requisitionNavigation.focusNextAdvanceField !== "function") {
      return false;
    }
    return Boolean(
      requisitionNavigation.focusNextAdvanceField(getRequisitionAdvanceFields(), currentField, {
        preferredNextField,
        excludedElements: [customAllergyInput],
      })
    );
  }

  getRequisitionValidationFields().forEach((field) => {
    field.addEventListener("blur", () => {
      applyFieldValidationState(field, { markTouched: true, force: true });
    });
    field.addEventListener("change", () => {
      applyFieldValidationState(field, { markTouched: true, force: true });
    });
    field.addEventListener("input", () => {
      refreshTouchedFieldValidationState(field);
    });
  });

  facilityNameInput?.addEventListener("focus", () => {
    renderFacilityResults(facilityNameInput.value, { forceOpen: true });
  });
  facilityNameInput?.addEventListener("input", () => {
    activeFacilityMatchIndex = 0;
    renderFacilityResults(facilityNameInput.value, { forceOpen: true });
    if (document.activeElement === providerNameInput || !providerResultsNode?.classList.contains("hidden")) {
      renderProviderResults(providerNameInput?.value || "", { forceOpen: true });
    }
  });
  facilityNameInput?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (facilityResultsNode?.classList.contains("hidden")) {
        renderFacilityResults(facilityNameInput.value, { forceOpen: true });
        return;
      }
      if (!facilityMatchResults.length) return;
      activeFacilityMatchIndex = Math.min(activeFacilityMatchIndex + 1, facilityMatchResults.length - 1);
      renderFacilityResults(facilityNameInput.value, { forceOpen: true });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!facilityMatchResults.length) return;
      activeFacilityMatchIndex = Math.max(activeFacilityMatchIndex - 1, 0);
      renderFacilityResults(facilityNameInput.value, { forceOpen: true });
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!facilityResultsNode?.classList.contains("hidden") && facilityMatchResults[activeFacilityMatchIndex]) {
        selectFacilityMatch(facilityMatchResults[activeFacilityMatchIndex], { focusNextField: true });
        return;
      }
      const resolved = resolveFacilityMatchFromInput(facilityNameInput.value);
      if (resolved) {
        selectFacilityMatch(resolved, { focusNextField: true });
      }
    } else if (event.key === "Escape") {
      hideFacilityResults();
    }
  });
  facilityNameInput?.addEventListener("blur", () => {
    window.setTimeout(() => {
      const resolved = resolveFacilityMatchFromInput(facilityNameInput.value);
      if (resolved) {
        selectFacilityMatch(resolved);
        return;
      }
      hideFacilityResults();
      refreshProviderAutocomplete(facilityNameInput.value, providerNameInput?.value || "");
    }, 120);
  });
  facilityToggleBtn?.addEventListener("click", () => {
    if (facilityResultsNode?.classList.contains("hidden")) {
      facilityNameInput?.focus();
      renderFacilityResults(facilityNameInput?.value || "", { forceOpen: true });
      return;
    }
    hideFacilityResults();
    facilityNameInput?.focus();
  });
  facilityResultsNode?.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  facilityResultsNode?.addEventListener("click", (event) => {
    const matchButton = event.target.closest("[data-facility-match-index]");
    if (!matchButton) return;
    const index = Number(matchButton.getAttribute("data-facility-match-index"));
    if (Number.isInteger(index) && facilityMatchResults[index]) {
      selectFacilityMatch(facilityMatchResults[index], { focusNextField: true });
    }
  });
  providerNameInput?.addEventListener("focus", () => {
    renderProviderResults(providerNameInput.value, { forceOpen: true });
  });
  providerNameInput?.addEventListener("input", () => {
    activeProviderMatchIndex = 0;
    syncProviderNpiFromInput();
    renderProviderResults(providerNameInput.value, { forceOpen: true });
  });
  providerNameInput?.addEventListener("keydown", async (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (providerResultsNode?.classList.contains("hidden")) {
        renderProviderResults(providerNameInput.value, { forceOpen: true });
        return;
      }
      if (!providerMatchResults.length) return;
      activeProviderMatchIndex = Math.min(activeProviderMatchIndex + 1, providerMatchResults.length - 1);
      renderProviderResults(providerNameInput.value, { forceOpen: true });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!providerMatchResults.length) return;
      activeProviderMatchIndex = Math.max(activeProviderMatchIndex - 1, 0);
      renderProviderResults(providerNameInput.value, { forceOpen: true });
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!providerResultsNode?.classList.contains("hidden") && providerMatchResults[activeProviderMatchIndex]) {
        selectProviderMatch(providerMatchResults[activeProviderMatchIndex], { focusNextField: true });
        return;
      }
      const resolved = resolveProviderMatchFromInput(providerNameInput.value, facilityNameInput?.value || "");
      if (resolved) {
        selectProviderMatch(resolved, { focusNextField: true });
      }
    } else if (event.key === "Escape") {
      hideProviderResults();
    }
  });
  providerNameInput?.addEventListener("blur", () => {
    window.setTimeout(() => {
      const resolved = syncProviderNpiFromInput({ allowLooseResolve: true });
      if (resolved) {
        selectProviderMatch(resolved);
        return;
      }
      hideProviderResults();
    }, 120);
  });
  providerToggleBtn?.addEventListener("click", () => {
    if (providerResultsNode?.classList.contains("hidden")) {
      providerNameInput?.focus();
      renderProviderResults(providerNameInput?.value || "", { forceOpen: true });
      return;
    }
    hideProviderResults();
    providerNameInput?.focus();
  });
  providerResultsNode?.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  providerResultsNode?.addEventListener("click", async (event) => {
    const matchButton = event.target.closest("[data-provider-match-index]");
    if (matchButton) {
      const index = Number(matchButton.getAttribute("data-provider-match-index"));
      if (Number.isInteger(index) && providerMatchResults[index]) {
        selectProviderMatch(providerMatchResults[index], { focusNextField: true });
      }
      return;
    }

    if (event.target.closest("[data-provider-add-custom]")) {
      await promptForCustomProvider(getCustomProviderDraft(providerNameInput?.value || ""));
    }
  });
  addProviderBtn?.addEventListener("click", async () => {
    await promptForCustomProvider(getCustomProviderDraft(providerNameInput?.value || ""));
  });
  customProviderModalNode?.addEventListener("click", (event) => {
    if (event.target === customProviderModalNode || event.target.closest("[data-custom-provider-cancel]")) {
      closeCustomProviderModal(null);
    }
  });
  customProviderModalNode?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCustomProviderModal(null);
    }
  });
  customProviderDesignationInput?.addEventListener("change", () => {
    syncCustomProviderDisplayName();
  });
  customProviderNameInput?.addEventListener("input", () => {
    syncCustomProviderDisplayName();
  });
  customProviderDisplayNameInput?.addEventListener("input", () => {
    delete customProviderDisplayNameInput.dataset.autoValue;
  });
  customProviderForm?.addEventListener("click", async (event) => {
    const fetchButton = event.target.closest("[data-custom-provider-npi-fetch]");
    if (!fetchButton) return;

    event.preventDefault();
    const normalizedNpi = normalizeNpiLookupValue(customProviderNpiInput?.value || "");
    if (normalizedNpi.length !== 10) {
      setCustomProviderModalError("Provider NPI must be 10 digits.");
      customProviderNpiInput?.focus();
      return;
    }

    setCustomProviderModalError("");
    customProviderNpiInput.value = normalizedNpi;

    const originalLabel = fetchButton.textContent;
    fetchButton.disabled = true;
    fetchButton.textContent = "Fetching...";

    try {
      const provider = await fetchProviderDetailsByNpi(normalizedNpi);
      applyProviderLookupToProviderForm(customProviderForm, provider);
      syncCustomProviderDisplayName();
      customProviderNameInput?.focus();
      customProviderNameInput?.select();
    } catch (error) {
      setCustomProviderModalError(error.message || "Unable to fetch provider information.");
    } finally {
      fetchButton.disabled = false;
      fetchButton.textContent = originalLabel;
    }
  });
  customProviderForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(customProviderForm).entries());
    const providerName = String(data.providerName || "").trim();
    const providerNpi = normalizeNpiLookupValue(data.npi || "");
    const designation = String(data.designation || "").trim();
    const fullProviderName = [designation, providerName].filter(Boolean).join(" ").trim();
    const displayName = String(data.displayName || "").trim() || fullProviderName || providerName;
    if (!providerName) {
      setCustomProviderModalError("Provider name is required.");
      customProviderNameInput?.focus();
      return;
    }
    if (providerNpi && providerNpi.length !== 10) {
      setCustomProviderModalError("Provider NPI must be 10 digits.");
      customProviderNpiInput?.focus();
      return;
    }
    closeCustomProviderModal({
      designation,
      providerName,
      displayName,
      providerNpi,
      contactNo: String(data.contactNo || "").trim(),
      extension: String(data.extension || "").trim(),
      dobMonth: String(data.dobMonth || "").trim(),
      dobDay: String(data.dobDay || "").trim(),
      dobYear: String(data.dobYear || "").trim(),
      email: String(data.email || "").trim(),
      alternateEmails: String(data.alternateEmails || "").trim(),
      credential: String(data.credential || "").trim(),
      speciality: String(data.speciality || "").trim(),
      mailingAddress: String(data.mailingAddress || "").trim(),
      city: String(data.city || "").trim(),
      state: String(data.state || "").trim(),
      zipcode: String(data.zipcode || "").trim(),
      faxNumber: String(data.faxNumber || "").trim(),
      comment: String(data.comment || "").trim(),
      source: String(customProviderForm?.dataset.lookupSource || "").trim(),
    });
  });
  scanReviewModalNode?.addEventListener("click", (event) => {
    if (event.target === scanReviewModalNode || event.target.closest("[data-scan-review-cancel]")) {
      closeScanReviewModal(null);
    }
  });
  scanReviewModalNode?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeScanReviewModal(null);
    }
  });
  scanReviewForm?.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target instanceof HTMLInputElement && event.target.type === "checkbox") {
      syncScanReviewDependentFields();
    }
  });
  scanReviewForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!activeScanReviewFieldKeys.length) {
      setScanReviewModalError("No extracted fields are available to validate.");
      return;
    }
    closeScanReviewModal(collectScanReviewValues());
  });
  scanUploadModalNode?.addEventListener("click", (event) => {
    if (scanUploadInFlight) return;
    if (event.target === scanUploadModalNode || event.target.closest("[data-scan-upload-cancel]")) {
      closeScanUploadModal();
    }
  });
  scanUploadModalNode?.addEventListener("keydown", (event) => {
    if (scanUploadInFlight) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeScanUploadModal();
    }
  });
  scanUploadSelectBtn?.addEventListener("click", () => {
    if (scanUploadInFlight) return;
    setScanUploadModalStatus("");
    scanUploadFileInput?.click();
  });
  scanUploadFileInput?.addEventListener("change", async () => {
    const file = scanUploadFileInput?.files?.[0];
    if (!file) return;
    await handleRequisitionScanUpload(file);
  });
  refreshFacilityAutocomplete(facilityNameInput?.value || "");
  refreshProviderAutocomplete(facilityNameInput?.value || "", providerNameInput?.value || "");

  if (facilityDataLoaded) {
    refreshFacilityAutocompleteState();
  } else {
    loadFacilityData()
      .then(() => {
        if (currentView !== "registration" || requisitionSubtab !== "create") return;
        refreshFacilityAutocompleteState();
      })
      .catch(() => {});
  }

  refreshPatientIdPreview();

  ["firstName", "middleName", "lastName", "suffix", "dob"].forEach((fieldName) => {
    const field = form.elements[fieldName];
    if (!field) return;
    field.addEventListener("input", refreshPatientIdPreview);
    field.addEventListener("change", refreshPatientIdPreview);
  });
  if (form.elements.dob) {
    form.elements.dob.addEventListener("input", syncAgeFromDob);
    form.elements.dob.addEventListener("change", syncAgeFromDob);
  }

  form.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.defaultPrevented) return;
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest("#req-facility-combobox, #req-provider-combobox")) return;
    if (!isAdvanceEligibleField(event.target)) return;
    if (focusNextRequisitionField(event.target)) {
      event.preventDefault();
    }
  });

  clearBtn.addEventListener("click", () => {
    if (isViewedRequisition) {
      renderRegistration(originalRequisitionRecord || prefillData, { sourceOrder: originalSourceOrder || sourceOrder, mode: "view" });
      return;
    }
    form.reset();
    patientDobPicker?.syncFromValue();
    clearCustomAllergies();
    syncSpecimenTypeDependentFields();
    syncAgeFromDob();
    clearRequisitionFieldValidationStates();
    refreshFacilityAutocompleteState();
    refreshPatientIdPreview();
    status.textContent = "Form cleared.";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isReadOnlyRequisition) return;
    if (isViewedRequisition && !canModifyViewedRequisition) {
      status.textContent = "Only pending orders can be modified.";
      return;
    }
    validateRequisitionFields();
    if (!form.reportValidity()) return;
    const data = readRequisitionFormData();
    data.patientId = resolvePatientId(data, patientIdNode.textContent.trim());
    if (savedRegistrationCreatedAt) data.createdAt = savedRegistrationCreatedAt;
    patientIdNode.textContent = data.patientId;
    try {
      if (isViewedRequisition) {
        const updatedRecord = { ...(prefillData || {}), ...data };
        const plan = getRequisitionChangePlan(originalRequisitionRecord || prefillData || {}, updatedRecord, originalSourceOrder || sourceOrder, sourceOrder);
        const approval = await openRequisitionChangeModal(plan);
        if (!approval?.approved) {
          status.textContent = "Requisition changes were not published.";
          return;
        }
        status.textContent = "Publishing requisition changes...";
        const updatedOrder = await publishApprovedRequisitionChanges(data, plan, approval);
        renderRegistration(updatedRecord, { sourceOrder: updatedOrder, mode: "view" });
        return;
      }
      const count = await saveRegistrationData(data);
      status.textContent = `Requisition saved for Patient ID ${data.patientId}. Total records: ${count}`;
      form.reset();
      patientDobPicker?.syncFromValue();
      clearCustomAllergies();
      syncSpecimenTypeDependentFields();
      syncAgeFromDob();
      clearRequisitionFieldValidationStates();
      refreshFacilityAutocompleteState();
      refreshPatientIdPreview();
    } catch (error) {
      status.textContent = error?.message || "Unable to save requisition.";
    }
  });

  registerAndOrderBtn.addEventListener("click", async () => {
    if (isViewedRequisition || isReadOnlyRequisition) return;
    validateRequisitionFields();
    if (!form.reportValidity()) return;
    if (registrationSubmitInFlight) return;
    registrationSubmitInFlight = true;
    setRegistrationSubmitBusy(true);
    const data = readRequisitionFormData();
    data.patientId = resolvePatientId(data, patientIdNode.textContent.trim());
    patientIdNode.textContent = data.patientId;
    try {
      status.textContent = "Creating requisition...";
      const count = await saveRegistrationData(data, { submissionId: registrationSubmissionId });
      status.textContent = `Requisition saved for Patient ID ${data.patientId}. Total records: ${count}`;
      renderOrderPatient(data);
    } catch (error) {
      status.textContent = error?.message || "Unable to save requisition.";
    } finally {
      registrationSubmitInFlight = false;
      setRegistrationSubmitBusy(false);
    }
  });

  if (isReadOnlyRequisition) {
    setRequisitionViewLock(true);
  }
}
