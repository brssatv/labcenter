(function initOrderHistoryReviewMenu(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LabCenterOrderHistoryReviewMenu = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const triggerLabel = "Review Result";
  const menuActions = Object.freeze([
    Object.freeze({
      key: "validate",
      label: "Validate",
      disabledLabel: "Validate (Requires Report)",
      tone: "validate",
    }),
    Object.freeze({
      key: "transcribe",
      label: "Transcribe",
      tone: "transcribe",
    }),
    Object.freeze({
      key: "reject",
      label: "Reject Order",
      tone: "reject",
    }),
  ]);

  function cloneAction(action) {
    return { ...action };
  }

  function getOrderHistoryReviewMenuLabel() {
    return triggerLabel;
  }

  function getOrderHistoryReviewMenuActions() {
    return menuActions.map(cloneAction);
  }

  function createOrderHistoryReviewMenuModel(options = {}) {
    const hasProcessedReport = Boolean(options.hasProcessedReport);
    const isOpen = Boolean(options.isOpen);
    const orderId = String(options.orderId || "").trim();
    const primaryActionKey = hasProcessedReport ? "validate" : "transcribe";

    const actions = menuActions
      .map((action) => {
        const disabled = action.key === "validate" && !hasProcessedReport;
        return {
          ...cloneAction(action),
          disabled,
          label: disabled ? (action.disabledLabel || action.label) : action.label,
          isPrimary: action.key === primaryActionKey,
        };
      })
      .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));

    const primaryAction = actions.find((action) => action.isPrimary) || actions[0] || null;

    return {
      available: Boolean(primaryAction),
      isOpen,
      orderId,
      triggerLabel,
      triggerState: isOpen ? "open" : "idle",
      ariaLabel: orderId ? `Review result options for order #${orderId}` : "Review result options",
      primaryAction,
      triggerTone: primaryAction?.tone || "validate",
      actions,
    };
  }

  return {
    getOrderHistoryReviewMenuLabel,
    getOrderHistoryReviewMenuActions,
    createOrderHistoryReviewMenuModel,
  };
});
