(function initOrderHistoryReportMenu(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LabCenterOrderHistoryReportMenu = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const triggerLabel = "Generate Report";
  const menuActions = Object.freeze([
    Object.freeze({
      key: "generate-report",
      label: "Generate Report",
      busyLabel: "Generating Report...",
      tone: "generate",
    }),
    Object.freeze({
      key: "generate-summary-report",
      label: "Summary Report",
      busyLabel: "Generating Summary...",
      tone: "summary",
    }),
    Object.freeze({
      key: "generate-final-report",
      label: "Final Report",
      busyLabel: "Generating Final...",
      tone: "final",
    }),
  ]);

  function cloneAction(action) {
    return { ...action };
  }

  function getOrderHistoryReportMenuLabel() {
    return triggerLabel;
  }

  function getOrderHistoryReportMenuActions() {
    return menuActions.map(cloneAction);
  }

  function createOrderHistoryReportMenuModel(options = {}) {
    const hasProcessedReport = Boolean(options.hasProcessedReport);
    const isOpen = Boolean(options.isOpen);
    const orderId = String(options.orderId || "").trim();
    const busyMap = {
      "generate-report": Boolean(options.isGenerating),
      "generate-summary-report": Boolean(options.isGeneratingSummary),
      "generate-final-report": Boolean(options.isGeneratingFinal),
    };

    if (!hasProcessedReport) {
      return {
        available: false,
        isOpen,
        orderId,
        triggerLabel,
        triggerState: "unavailable",
        ariaLabel: orderId ? `Generate report options for order #${orderId}` : "Generate report options",
        actions: [],
      };
    }

    const actions = menuActions.map((action) => {
      const isBusy = busyMap[action.key];
      return {
        ...cloneAction(action),
        disabled: isBusy,
        isBusy,
        label: isBusy ? action.busyLabel : action.label,
      };
    });

    const hasBusyAction = actions.some((action) => action.isBusy);
    return {
      available: true,
      isOpen,
      orderId,
      triggerLabel,
      triggerState: hasBusyAction ? "busy" : isOpen ? "open" : "idle",
      ariaLabel: orderId ? `Generate report options for order #${orderId}` : "Generate report options",
      actions,
    };
  }

  return {
    getOrderHistoryReportMenuLabel,
    getOrderHistoryReportMenuActions,
    createOrderHistoryReportMenuModel,
  };
});
