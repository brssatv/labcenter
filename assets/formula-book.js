(function initFormulaBook(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LabCenterFormulaBook = api;
})(typeof globalThis !== "undefined" ? globalThis : this, (root) => {
  let pendingFocusDescriptor = null;

  function defaultEscapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function getReportFormulasApi() {
    return root?.LabCenterReportFormulas || null;
  }

  function getFormulaPlaygroundApi() {
    return root?.LabCenterFormulaPlayground || null;
  }

  function captureFocusDescriptor(node) {
    if (!node || typeof node.matches !== "function") return null;
    if (node.matches("[data-formula-playground-data-input]")) {
      return {
        selector: "[data-formula-playground-data-input]",
        selectionStart: node.selectionStart,
        selectionEnd: node.selectionEnd,
      };
    }
    if (node.matches("[data-formula-playground-expression]")) {
      return {
        selector: "[data-formula-playground-expression]",
        selectionStart: node.selectionStart,
        selectionEnd: node.selectionEnd,
      };
    }
    if (node.matches("[data-formula-playground-selection-field]")) {
      const field = node.getAttribute("data-formula-playground-selection-field") || "";
      return {
        selector: `[data-formula-playground-selection-field="${field}"]`,
        selectionStart: typeof node.selectionStart === "number" ? node.selectionStart : null,
        selectionEnd: typeof node.selectionEnd === "number" ? node.selectionEnd : null,
      };
    }
    if (node.matches("[data-formula-playground-row-collection][data-formula-playground-row-index][data-formula-playground-row-field]")) {
      const collection = node.getAttribute("data-formula-playground-row-collection") || "";
      const index = node.getAttribute("data-formula-playground-row-index") || "";
      const field = node.getAttribute("data-formula-playground-row-field") || "";
      return {
        selector: `[data-formula-playground-row-collection="${collection}"][data-formula-playground-row-index="${index}"][data-formula-playground-row-field="${field}"]`,
        selectionStart: typeof node.selectionStart === "number" ? node.selectionStart : null,
        selectionEnd: typeof node.selectionEnd === "number" ? node.selectionEnd : null,
      };
    }
    return null;
  }

  function restorePendingFocus(panelBody) {
    if (!pendingFocusDescriptor?.selector) return;
    const node = panelBody.querySelector(pendingFocusDescriptor.selector);
    if (!node || typeof node.focus !== "function") {
      pendingFocusDescriptor = null;
      return;
    }
    node.focus();
    if (
      typeof node.setSelectionRange === "function"
      && typeof pendingFocusDescriptor.selectionStart === "number"
      && typeof pendingFocusDescriptor.selectionEnd === "number"
    ) {
      node.setSelectionRange(pendingFocusDescriptor.selectionStart, pendingFocusDescriptor.selectionEnd);
    }
    pendingFocusDescriptor = null;
  }

  function createDefaultFormulaBookState() {
    return {
      section: "report-formulas",
      reportType: "",
    };
  }

  function buildSarsCov2FinalReportPlaceholder(formula) {
    const normalized = formula || getSarsCov2FinalReportFormulaConfig();
    const comparisons = normalized.targets.map((target) => `${target.label} Ct <= ${normalized.thresholdCt}`);
    return [
      `IF COUNT(${comparisons.join(", ")}) >= ${normalized.minimumPositiveTargets}`,
      `THEN ${normalized.pathogenLabel} = Positive`,
      `ELSE ${normalized.pathogenLabel} = Negative`,
    ].join("\n");
  }

  function getSarsCov2FinalReportFormulaConfig() {
    const formula = getReportFormulasApi()?.getSarsCov2FinalReportFormula?.();
    const defaultTargets = [
      { key: "e", label: "E Gene" },
      { key: "n", label: "N Gene" },
      { key: "orf1ab", label: "Orf1ab" },
    ];
    const targets = Array.isArray(formula?.targets)
      ? formula.targets
          .filter((item) => item && item.key)
          .map((item) => ({
            key: String(item.key).trim(),
            label: String(item.label || item.key).trim(),
          }))
      : [];

    const normalized = {
      key: String(formula?.key || "sars-cov-2-final-report"),
      title: String(formula?.title || "SARS-CoV-2 Final Report Formula"),
      pathogenLabel: String(formula?.pathogenLabel || "SARS-CoV-2"),
      reportType: String(formula?.reportType || "finalReport"),
      enabled: formula?.enabled !== false,
      statusLabel: String(formula?.statusLabel || (formula?.enabled === false ? "Disabled" : "Enabled")),
      thresholdCt: Number.isFinite(Number(formula?.thresholdCt)) ? Number(formula.thresholdCt) : 33,
      minimumPositiveTargets: Number.isFinite(Number(formula?.minimumPositiveTargets))
        ? Number(formula.minimumPositiveTargets)
        : 2,
      targets: targets.length ? targets : defaultTargets,
    };

    return {
      ...normalized,
      placeholder: String(formula?.placeholder || buildSarsCov2FinalReportPlaceholder(normalized)),
    };
  }

  function getFormulaBookSections() {
    const sections = getReportFormulasApi()?.getFormulaBookSections?.();
    if (Array.isArray(sections) && sections.length) {
      return sections.filter((item) => item && item.key && item.label);
    }
    return [{ key: "report-formulas", label: "Formula for Reports" }];
  }

  function getFormulaBookReportTypeOptions() {
    const options = getReportFormulasApi()?.getReportTypeOptions?.();
    if (Array.isArray(options) && options.length) {
      return options.filter((item) => item && item.key && item.label);
    }
    return [
      { key: "generateReport", label: "Generate Report" },
      { key: "generateSummaryReport", label: "Summary Report" },
      { key: "finalReport", label: "Final Report" },
    ];
  }

  function getFormulaBookReportReference(reportType) {
    if (!reportType) return null;
    const reference = getReportFormulasApi()?.getReportFormulaReference?.(reportType);
    if (reference?.selectedReportType?.key) {
      return {
        ...reference,
        configured: reference.configured !== false,
        enabled: reference.enabled !== false,
        displayLogic: reference.displayLogic && typeof reference.displayLogic === "object"
          ? {
              ...reference.displayLogic,
              evaluationSteps: Array.isArray(reference.displayLogic.evaluationSteps)
                ? reference.displayLogic.evaluationSteps.map((item) => String(item || "").trim()).filter(Boolean)
                : [],
              displaySteps: Array.isArray(reference.displayLogic.displaySteps)
                ? reference.displayLogic.displaySteps.map((item) => String(item || "").trim()).filter(Boolean)
                : [],
            }
          : null,
        placeholder: String(reference.placeholder || reference.formula?.placeholder || ""),
        note: String(reference.note || "").trim(),
      };
    }

    const selectedReportType = getFormulaBookReportTypeOptions().find((item) => item.key === reportType);
    if (!selectedReportType) return null;

    const formula = getSarsCov2FinalReportFormulaConfig();
    const isNativeReportType = selectedReportType.key === formula.reportType;
    if (!isNativeReportType) {
      return {
        sectionKey: "report-formulas",
        selectedReportType,
        configured: false,
        enabled: false,
        formula: null,
        displayLogic: null,
        placeholder: "",
        note: `No formula is configured yet for ${selectedReportType.label}.`,
      };
    }

    return {
      sectionKey: "report-formulas",
      selectedReportType,
      configured: true,
      enabled: formula.enabled !== false,
      formula,
      displayLogic: null,
      placeholder: formula.placeholder,
      note: "This is the active SARS-CoV-2 formula used during Final Report generation.",
    };
  }

  function normalizeFormulaBookState(state) {
    const sections = getFormulaBookSections();
    const reportTypeOptions = getFormulaBookReportTypeOptions();
    const nextState = {
      section: sections.some((item) => item.key === state?.section)
        ? state.section
        : (sections[0]?.key || "report-formulas"),
      reportType: String(state?.reportType || "").trim(),
    };

    if (nextState.reportType && !reportTypeOptions.some((item) => item.key === nextState.reportType)) {
      nextState.reportType = "";
    }

    return {
      state: nextState,
      sections,
      reportTypeOptions,
    };
  }

  function buildFormulaPlaygroundMarkup(playgroundPreview, escapeHtml = defaultEscapeHtml) {
    if (!playgroundPreview) return "";

    const inputViewTabsMarkup = `
      <div class="mr-tabs formula-playground-view-tabs" role="tablist" aria-label="Data Input View">
        <button
          type="button"
          class="mr-tab ${playgroundPreview.inputView === "json" ? "active" : ""}"
          data-formula-playground-input-view="json"
          aria-selected="${playgroundPreview.inputView === "json" ? "true" : "false"}"
        >
          Show JSON
        </button>
        <button
          type="button"
          class="mr-tab ${playgroundPreview.inputView === "table" ? "active" : ""}"
          data-formula-playground-input-view="table"
          aria-selected="${playgroundPreview.inputView === "table" ? "true" : "false"}"
        >
          Show Table
        </button>
      </div>
    `;

    const inputTableMarkup = playgroundPreview.inputModel
      ? `
          <div class="formula-playground-input-table-stack">
            <section class="formula-playground-input-table-card">
              <p class="formula-playground-input-table-title">Selections</p>
              <div class="formula-playground-table-wrap">
                <table class="formula-playground-table formula-playground-input-table">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${playgroundPreview.inputModel.selections.map((row) => `
                      <tr>
                        <td>${escapeHtml(row.label)}</td>
                        <td>
                          <select data-formula-playground-selection-field="${escapeHtml(row.field)}">
                            ${row.options.map((option) => `
                              <option value="${escapeHtml(option)}" ${option === row.value ? "selected" : ""}>${escapeHtml(option)}</option>
                            `).join("")}
                          </select>
                        </td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            </section>

            ${playgroundPreview.inputModel.sections.map((section) => `
              <section class="formula-playground-input-table-card">
                <p class="formula-playground-input-table-title">${escapeHtml(section.title)}</p>
                <div class="formula-playground-table-wrap">
                  <table class="formula-playground-table formula-playground-input-table">
                    <thead>
                      <tr>
                        ${section.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
                      </tr>
                    </thead>
                    <tbody>
                      ${section.rows.map((row) => `
                        <tr>
                          ${section.columns.map((column) => {
                            if (column.inputType === "boolean") {
                              return `
                                <td>
                                  <select
                                    data-formula-playground-row-collection="${escapeHtml(section.key)}"
                                    data-formula-playground-row-index="${escapeHtml(String(row.index))}"
                                    data-formula-playground-row-field="${escapeHtml(column.key)}"
                                  >
                                    <option value="true" ${row[column.key] ? "selected" : ""}>True</option>
                                    <option value="false" ${!row[column.key] ? "selected" : ""}>False</option>
                                  </select>
                                </td>
                              `;
                            }

                            return `
                              <td>
                                <input
                                  type="${column.inputType === "number" ? "number" : "text"}"
                                  ${column.inputType === "number" ? 'step="0.1"' : ""}
                                  value="${escapeHtml(String(row[column.key] ?? ""))}"
                                  data-formula-playground-row-collection="${escapeHtml(section.key)}"
                                  data-formula-playground-row-index="${escapeHtml(String(row.index))}"
                                  data-formula-playground-row-field="${escapeHtml(column.key)}"
                                >
                              </td>
                            `;
                          }).join("")}
                        </tr>
                      `).join("")}
                    </tbody>
                  </table>
                </div>
              </section>
            `).join("")}
          </div>
        `
      : "";

    const dataInputEditorMarkup = playgroundPreview.inputView === "table" && !playgroundPreview.draftDataError
      ? inputTableMarkup
      : `
          <textarea
            rows="14"
            class="formula-playground-editor formula-playground-editor-data"
            data-formula-playground-data-input
          >${escapeHtml(playgroundPreview.draft.dataInput)}</textarea>
        `;

    const outputPreviewMarkup = playgroundPreview.outputView === "table"
      ? `
          <div class="formula-playground-table-wrap">
            <table class="formula-playground-table">
              <thead>
                <tr>
                  ${playgroundPreview.outputTable.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${playgroundPreview.outputTable.rows.length
                  ? playgroundPreview.outputTable.rows.map((row) => `
                      <tr>
                        ${playgroundPreview.outputTable.columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join("")}
                      </tr>
                    `).join("")
                  : `
                      <tr>
                        <td colspan="${playgroundPreview.outputTable.columns.length}" class="formula-playground-table-empty">No processed output rows are available for this run.</td>
                      </tr>
                    `}
              </tbody>
            </table>
          </div>
        `
      : `<pre class="formula-playground-output-preview">${escapeHtml(playgroundPreview.outputText)}</pre>`;

    return `
      <section class="formula-playground-card">
        <div class="formula-playground-head">
          <div>
            <p class="formula-book-helper-label">Interactive Playground</p>
            <h4>Simple Formula Tester</h4>
            <p>Enter sample data, edit the formula, and run the formula to refresh the processed output.</p>
          </div>
          <div class="formula-playground-actions">
            <button type="button" class="btn-primary" data-formula-playground-run>Run Formula</button>
            <button type="button" class="btn-ghost" data-formula-playground-reset>Reset Draft</button>
          </div>
        </div>

        <div class="formula-playground-stack">
          <section class="formula-playground-box formula-playground-input-box">
            <div class="formula-playground-output-meta">
              <span class="formula-playground-output-label">Data Input</span>
              ${inputViewTabsMarkup}
            </div>

            ${playgroundPreview.inputView === "table" && playgroundPreview.draftDataError
              ? `
                  <div class="formula-playground-feedback formula-playground-feedback-error">
                    <strong>Data Input Error</strong>
                    <p>Table view is unavailable until the JSON draft is valid. ${escapeHtml(playgroundPreview.draftDataError)}</p>
                  </div>
                `
              : ""}

            ${dataInputEditorMarkup}
            <p class="formula-playground-box-note">${playgroundPreview.inputView === "table" && !playgroundPreview.draftDataError
              ? "Edit sample genes, organisms, pathogens, and selections in table format."
              : "Enter sample genes, organisms, and pathogens in JSON format."}</p>
          </section>

          <label class="mr-field formula-playground-box">
            <span>Formula Expression</span>
            <textarea
              rows="9"
              class="formula-playground-editor formula-playground-editor-expression"
              data-formula-playground-expression
            >${escapeHtml(playgroundPreview.draft.formulaExpression)}</textarea>
            <div class="formula-playground-token-bank">
              ${playgroundPreview.helperTokens.map((token) => `
                <span class="mr-stat"><strong>${escapeHtml(token)}</strong><span>Supported Token</span></span>
              `).join("")}
            </div>
          </label>

          <section class="formula-playground-box formula-playground-output-box">
            <div class="formula-playground-output-head">
              <div class="formula-playground-output-meta">
                <span class="formula-playground-output-label">Processed Output</span>
                <div class="mr-tabs formula-playground-view-tabs" role="tablist" aria-label="Processed Output View">
                  <button
                    type="button"
                    class="mr-tab ${playgroundPreview.outputView === "json" ? "active" : ""}"
                    data-formula-playground-view="json"
                    aria-selected="${playgroundPreview.outputView === "json" ? "true" : "false"}"
                  >
                    Show JSON
                  </button>
                  <button
                    type="button"
                    class="mr-tab ${playgroundPreview.outputView === "table" ? "active" : ""}"
                    data-formula-playground-view="table"
                    aria-selected="${playgroundPreview.outputView === "table" ? "true" : "false"}"
                  >
                    Show Table
                  </button>
                </div>
              </div>
              <span class="mr-stat"><strong>${escapeHtml(playgroundPreview.formulaResult.status || "Preview")}</strong><span>Formula Result</span></span>
            </div>

            ${playgroundPreview.hasPendingChanges
              ? `
                  <div class="formula-playground-feedback">
                    <strong>Draft Updated</strong>
                    <p>New edits are ready. Select Run Formula to process the latest data and formula.</p>
                  </div>
                `
              : ""}

            ${playgroundPreview.dataError
              ? `
                  <div class="formula-playground-feedback formula-playground-feedback-error">
                    <strong>Data Error</strong>
                    <p>${escapeHtml(playgroundPreview.dataError)}</p>
                  </div>
                `
              : ""}

            ${playgroundPreview.formulaResult.error && !playgroundPreview.dataError
              ? `
                  <div class="formula-playground-feedback formula-playground-feedback-error">
                    <strong>Formula Error</strong>
                    <p>${escapeHtml(playgroundPreview.formulaResult.error)}</p>
                  </div>
                `
              : `
                  <div class="formula-playground-feedback">
                    <strong>Evaluated Formula</strong>
                    <p>${escapeHtml(playgroundPreview.formulaResult.displayValue || "Empty result")}</p>
                  </div>
                `}

            ${outputPreviewMarkup}
            <p class="formula-book-note formula-playground-note">This box shows the processed result from the last formula run.</p>
          </section>
        </div>
      </section>
    `;
  }

  function buildFormulaBookViewModel(state) {
    const normalized = normalizeFormulaBookState(state);
    const reportReference = normalized.state.section === "report-formulas"
      ? getFormulaBookReportReference(normalized.state.reportType)
      : null;
    const formulaConfig = reportReference?.configured
      ? (reportReference.formula || getSarsCov2FinalReportFormulaConfig())
      : null;
    const displayLogic = reportReference?.displayLogic && typeof reportReference.displayLogic === "object"
      ? reportReference.displayLogic
      : null;
    const formulaPlayground = normalized.state.reportType === "finalReport" && reportReference?.configured
      ? getFormulaPlaygroundApi()?.buildFormulaPlaygroundPreview?.()
      : null;

    return {
      ...normalized,
      reportReference,
      formulaConfig,
      displayLogic,
      formulaPlayground,
    };
  }

  function buildFormulaBookMarkup(viewModel, escapeHtml = defaultEscapeHtml) {
    const formulaBookSummaryMarkup = viewModel.formulaConfig
      ? `
          <div class="master-registry-summary">
            <span class="mr-stat"><strong>${escapeHtml(viewModel.formulaConfig.pathogenLabel)}</strong><span>Reference Pathogen</span></span>
            <span class="mr-stat"><strong>&lt;= ${escapeHtml(String(viewModel.formulaConfig.thresholdCt))}</strong><span>Ct Threshold</span></span>
            <span class="mr-stat"><strong>${escapeHtml(String(viewModel.formulaConfig.minimumPositiveTargets))}</strong><span>Targets Required</span></span>
            <span class="mr-stat"><strong>${escapeHtml(viewModel.formulaConfig.statusLabel || (viewModel.formulaConfig.enabled !== false ? "Enabled" : "Disabled"))}</strong><span>Formula State</span></span>
          </div>
        `
      : viewModel.reportReference
      ? `
          <div class="master-registry-summary">
            <span class="mr-stat"><strong>${escapeHtml(viewModel.reportReference.selectedReportType.label)}</strong><span>Selected Report</span></span>
            <span class="mr-stat"><strong>Not Configured</strong><span>Formula Status</span></span>
          </div>
        `
      : `
          <div class="master-registry-summary">
            <span class="mr-stat"><strong>Select a report type</strong><span>Formula Status</span></span>
          </div>
        `;

    const formulaBookToolbarCopy = viewModel.formulaConfig
      ? `
          <div class="formula-book-toolbar-copy">
            <p class="formula-book-helper-label">Live Formula Toggle</p>
            <p class="formula-book-helper-text">${escapeHtml(viewModel.displayLogic?.summary || "Control whether this formula actively drives the Final Report SARS-CoV-2 display.")}</p>
            <button
              type="button"
              class="output-results-toggle formula-book-activation-toggle ${viewModel.formulaConfig.enabled !== false ? "is-active" : ""}"
              data-formula-book-enabled-toggle
              aria-pressed="${viewModel.formulaConfig.enabled !== false ? "true" : "false"}"
              aria-label="${viewModel.formulaConfig.enabled !== false ? "Disable SARS-CoV-2 final report formula" : "Enable SARS-CoV-2 final report formula"}"
            >
              <span class="output-results-toggle-knob" aria-hidden="true"></span>
              <span>${viewModel.formulaConfig.enabled !== false ? "Enabled" : "Disabled"}</span>
            </button>
          </div>
        `
      : `
          <div class="formula-book-toolbar-copy">
            <p class="formula-book-helper-label">Configuration Status</p>
            <p class="formula-book-helper-text">Final Report currently exposes the active SARS-CoV-2 formula. Other report types will appear here once their formulas are configured.</p>
          </div>
        `;

    const formulaBookDisplayLogicMarkup = viewModel.displayLogic
      ? `
          <section class="formula-book-logic-card">
            <div class="formula-book-logic-head">
              <p class="formula-book-helper-label">Report Display Logic</p>
              <h4>${escapeHtml(viewModel.displayLogic.title || "Display Logic on Final Report")}</h4>
              <p>${escapeHtml(viewModel.displayLogic.summary || "")}</p>
            </div>
            <div class="formula-book-logic-grid">
              <section class="formula-book-logic-section">
                <p class="formula-book-logic-label">Evaluation</p>
                <ul class="formula-book-logic-list">
                  ${viewModel.displayLogic.evaluationSteps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                </ul>
              </section>
              <section class="formula-book-logic-section">
                <p class="formula-book-logic-label">Report Output</p>
                <ul class="formula-book-logic-list">
                  ${viewModel.displayLogic.displaySteps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                </ul>
              </section>
            </div>
          </section>
        `
      : "";

    const formulaBookContentMarkup = viewModel.reportReference
      ? viewModel.reportReference.configured && viewModel.formulaConfig
        ? `
            <div class="formula-book-status-row">
              <div class="master-registry-summary formula-book-meta">
                <span class="mr-stat"><strong>${escapeHtml(viewModel.reportReference.selectedReportType.label)}</strong><span>Selected Report</span></span>
                <span class="mr-stat"><strong>${escapeHtml(viewModel.formulaConfig.title)}</strong><span>Source Formula</span></span>
              </div>
            </div>
            <div class="formula-book-detail-grid">
              <label class="mr-field formula-book-placeholder-field">
                <span>Formula Placeholder</span>
                <pre class="formula-book-placeholder">${escapeHtml(viewModel.reportReference.placeholder)}</pre>
              </label>
              ${formulaBookDisplayLogicMarkup}
            </div>
            ${buildFormulaPlaygroundMarkup(viewModel.formulaPlayground, escapeHtml)}
            <p class="formula-book-note">${escapeHtml(viewModel.reportReference.note)}</p>
          `
        : `
            <section class="formula-book-empty">
              <h4>No formula configured yet</h4>
              <p>${escapeHtml(viewModel.reportReference.note)}</p>
            </section>
          `
      : `
          <section class="formula-book-empty">
            <h4>Select a report type</h4>
            <p>Choose Generate Report, Summary Report, or Final Report to review its configured formula.</p>
          </section>
        `;

    return `
      <section class="master-registry-page formula-book-page">
        <div class="mr-tabs" role="tablist" aria-label="Formula Book Sections">
          ${viewModel.sections.map((section) => `
            <button
              type="button"
              class="mr-tab ${section.key === viewModel.state.section ? "active" : ""}"
              data-formula-book-section="${escapeHtml(section.key)}"
              aria-selected="${section.key === viewModel.state.section ? "true" : "false"}"
            >
              ${escapeHtml(section.label)}
            </button>
          `).join("")}
        </div>

        <section class="formula-book-card">
          <div class="formula-book-card-head">
            <div>
              <h3>Formula for Reports</h3>
              <p>Review modular report placeholders before promoting new logic into the live reporting flow.</p>
            </div>
            ${formulaBookSummaryMarkup}
          </div>

          <div class="master-registry-toolbar mr-toolbar-two formula-book-toolbar">
            <label class="mr-field">
              <span>Report Type</span>
              <select data-formula-book-report-type>
                <option value="">Select a report type</option>
                ${viewModel.reportTypeOptions.map((item) => `
                  <option value="${escapeHtml(item.key)}" ${item.key === viewModel.state.reportType ? "selected" : ""}>
                    ${escapeHtml(item.label)}
                  </option>
                `).join("")}
              </select>
            </label>
            ${formulaBookToolbarCopy}
          </div>

          ${formulaBookContentMarkup}
        </section>
      </section>
    `;
  }

  function renderFormulaBookView(options = {}) {
    const panelBody = options.panelBody;
    if (!panelBody || typeof panelBody.innerHTML !== "string") {
      throw new Error("Formula Book requires a valid panel body host element.");
    }

    const viewModel = buildFormulaBookViewModel(options.state || createDefaultFormulaBookState());
    const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
    panelBody.innerHTML = buildFormulaBookMarkup(viewModel, escapeHtml);

    const onStateChange = typeof options.onStateChange === "function" ? options.onStateChange : () => {};
    Array.from(panelBody.querySelectorAll("[data-formula-book-section]")).forEach((button) => {
      button.addEventListener("click", () => {
        onStateChange({
          ...viewModel.state,
          section: button.getAttribute("data-formula-book-section") || "report-formulas",
        });
      });
    });

    panelBody.querySelector("[data-formula-book-report-type]")?.addEventListener("change", (event) => {
      onStateChange({
        ...viewModel.state,
        reportType: String(event.target?.value || ""),
      });
    });

    panelBody.querySelector("[data-formula-book-enabled-toggle]")?.addEventListener("click", () => {
      const nextEnabled = viewModel.formulaConfig?.enabled === false;
      const setEnabled = getReportFormulasApi()?.setSarsCov2FinalReportFormulaEnabled;
      if (typeof setEnabled !== "function") return;
      setEnabled(nextEnabled);
      onStateChange({
        ...viewModel.state,
      });
    });

    const playgroundApi = getFormulaPlaygroundApi();
    panelBody.querySelector("[data-formula-playground-run]")?.addEventListener("click", () => {
      if (typeof playgroundApi?.runFormulaPlaygroundDraft !== "function") {
        return;
      }
      playgroundApi.runFormulaPlaygroundDraft();
      onStateChange({
        ...viewModel.state,
      });
    });

    Array.from(panelBody.querySelectorAll("[data-formula-playground-input-view]")).forEach((button) => {
      button.addEventListener("click", () => {
        if (typeof playgroundApi?.writeFormulaPlaygroundInputView !== "function") {
          return;
        }
        playgroundApi.writeFormulaPlaygroundInputView(button.getAttribute("data-formula-playground-input-view") || "json");
        onStateChange({
          ...viewModel.state,
        });
      });
    });

    Array.from(panelBody.querySelectorAll("[data-formula-playground-view]")).forEach((button) => {
      button.addEventListener("click", () => {
        if (typeof playgroundApi?.writeFormulaPlaygroundOutputView !== "function") {
          return;
        }
        playgroundApi.writeFormulaPlaygroundOutputView(button.getAttribute("data-formula-playground-view") || "json");
        onStateChange({
          ...viewModel.state,
        });
      });
    });

    Array.from(panelBody.querySelectorAll("[data-formula-playground-selection-field]")).forEach((node) => {
      node.addEventListener("change", (event) => {
        if (
          typeof playgroundApi?.readFormulaPlaygroundDraft !== "function"
          || typeof playgroundApi?.writeFormulaPlaygroundDraft !== "function"
          || typeof playgroundApi?.updateFormulaPlaygroundDraftSelection !== "function"
        ) {
          return;
        }
        const currentDraft = playgroundApi.readFormulaPlaygroundDraft();
        pendingFocusDescriptor = captureFocusDescriptor(event.target);
        const nextDraft = playgroundApi.updateFormulaPlaygroundDraftSelection(
          event.target?.getAttribute("data-formula-playground-selection-field") || "",
          event.target?.value || "",
          currentDraft
        );
        playgroundApi.writeFormulaPlaygroundDraft(nextDraft);
        onStateChange({
          ...viewModel.state,
        });
      });
    });

    Array.from(panelBody.querySelectorAll("[data-formula-playground-row-collection][data-formula-playground-row-index][data-formula-playground-row-field]")).forEach((node) => {
      const handler = (event) => {
        if (
          typeof playgroundApi?.readFormulaPlaygroundDraft !== "function"
          || typeof playgroundApi?.writeFormulaPlaygroundDraft !== "function"
          || typeof playgroundApi?.updateFormulaPlaygroundDraftRow !== "function"
        ) {
          return;
        }
        const currentDraft = playgroundApi.readFormulaPlaygroundDraft();
        pendingFocusDescriptor = captureFocusDescriptor(event.target);
        const nextDraft = playgroundApi.updateFormulaPlaygroundDraftRow(
          event.target?.getAttribute("data-formula-playground-row-collection") || "",
          event.target?.getAttribute("data-formula-playground-row-index") || "",
          event.target?.getAttribute("data-formula-playground-row-field") || "",
          event.target?.value || "",
          currentDraft
        );
        playgroundApi.writeFormulaPlaygroundDraft(nextDraft);
        onStateChange({
          ...viewModel.state,
        });
      };

      node.addEventListener("input", handler);
      node.addEventListener("change", handler);
    });

    panelBody.querySelector("[data-formula-playground-reset]")?.addEventListener("click", () => {
      playgroundApi?.resetFormulaPlaygroundDraft?.();
      onStateChange({
        ...viewModel.state,
      });
    });

    panelBody.querySelector("[data-formula-playground-data-input]")?.addEventListener("input", (event) => {
      if (typeof playgroundApi?.readFormulaPlaygroundDraft !== "function" || typeof playgroundApi?.writeFormulaPlaygroundDraft !== "function") {
        return;
      }
      const currentDraft = playgroundApi.readFormulaPlaygroundDraft();
      pendingFocusDescriptor = captureFocusDescriptor(event.target);
      playgroundApi.writeFormulaPlaygroundDraft({
        ...currentDraft,
        dataInput: String(event.target?.value || ""),
      });
      onStateChange({
        ...viewModel.state,
      });
    });

    panelBody.querySelector("[data-formula-playground-expression]")?.addEventListener("input", (event) => {
      if (typeof playgroundApi?.readFormulaPlaygroundDraft !== "function" || typeof playgroundApi?.writeFormulaPlaygroundDraft !== "function") {
        return;
      }
      const currentDraft = playgroundApi.readFormulaPlaygroundDraft();
      pendingFocusDescriptor = captureFocusDescriptor(event.target);
      playgroundApi.writeFormulaPlaygroundDraft({
        ...currentDraft,
        formulaExpression: String(event.target?.value || ""),
      });
      onStateChange({
        ...viewModel.state,
      });
    });

    restorePendingFocus(panelBody);

    return viewModel.state;
  }

  return {
    createDefaultFormulaBookState,
    getSarsCov2FinalReportFormulaConfig,
    getFormulaBookReportReference,
    buildFormulaBookViewModel,
    buildFormulaBookMarkup,
    renderFormulaBookView,
  };
});
