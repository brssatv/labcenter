(function initRequisitionWorkflow(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LabCenterRequisitionWorkflow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const auditEventLabels = Object.freeze({
    order_created: "Order created",
    results_processed: "Results processed",
    requisition_modified: "Requisition modified",
    order_rejected: "Order rejected",
    order_rejection_undone: "Order rejection undone",
    order_completed: "Order completed",
    report_amendment_initiated: "Report amendment initiated",
    report_marked_published_for_testing: "Report marked published for testing",
    order_updated: "Order updated",
  });

  function normalizeStatus(value, fallback = "Pending") {
    return String(value || fallback).trim() || fallback;
  }

  function canRejectOrder(order) {
    if (!order) return false;
    const status = normalizeStatus(order.status).toLowerCase();
    return !["rejected", "complete", "dismissed"].includes(status)
      && !order?.publishedReports?.final?.publishedAt;
  }

  function canUndoRejectOrder(order) {
    return normalizeStatus(order?.status).toLowerCase() === "rejected";
  }

  function getStatusBeforeRejection(order) {
    return normalizeStatus(order?.statusBeforeRejection, "Pending");
  }

  function createRejectionPatch(order, options = {}) {
    if (!canRejectOrder(order)) throw new Error("Order cannot be rejected in its current status.");
    const reason = String(options.reason || "").trim();
    if (!reason) throw new Error("A rejection reason is required.");
    const rejectedAt = String(options.at || new Date().toISOString());
    return {
      statusBeforeRejection: normalizeStatus(order?.status),
      status: "Rejected",
      rejectedAt,
      rejectedBy: String(options.actor || "clinician").trim() || "clinician",
      rejectionReason: reason,
      updatedAt: rejectedAt,
    };
  }

  function createUndoRejectionPatch(order, options = {}) {
    if (!canUndoRejectOrder(order)) throw new Error("Order is not rejected.");
    const rejectionUndoneAt = String(options.at || new Date().toISOString());
    return {
      status: getStatusBeforeRejection(order),
      rejectionUndoneAt,
      rejectionUndoneBy: String(options.actor || "clinician").trim() || "clinician",
      updatedAt: rejectionUndoneAt,
    };
  }

  function getDerivedAuditEvents(order) {
    if (!order) return [];
    return [
      order.createdAt ? { eventType: "order_created", eventAt: order.createdAt, actor: order.createdBy || "System", reason: "" } : null,
      order.processedResult?.processedAt ? { eventType: "results_processed", eventAt: order.processedResult.processedAt, actor: order.processedResult.processedBy || "System", reason: "" } : null,
      order.requisitionChange?.approvedAt ? { eventType: "requisition_modified", eventAt: order.requisitionChange.approvedAt, actor: order.requisitionChange.approvedBy || "Clinician", reason: order.requisitionChange.reason || "" } : null,
      order.rejectedAt ? { eventType: "order_rejected", eventAt: order.rejectedAt, actor: order.rejectedBy || "Clinician", reason: order.rejectionReason || "" } : null,
      order.rejectionUndoneAt ? { eventType: "order_rejection_undone", eventAt: order.rejectionUndoneAt, actor: order.rejectionUndoneBy || "Clinician", reason: order.rejectionReason || "" } : null,
      order.completedAt ? { eventType: "order_completed", eventAt: order.completedAt, actor: order.completedBy || "System", reason: "" } : null,
    ].filter(Boolean);
  }

  function mergeAuditEvents(events = [], order = null) {
    const unique = new Map();
    [...events, ...getDerivedAuditEvents(order)].forEach((event) => {
      const eventType = String(event?.eventType || "").trim();
      const eventAt = String(event?.eventAt || "").trim();
      if (!eventType || !eventAt) return;
      unique.set(`${eventType}:${eventAt}`, { ...event, eventType, eventAt });
    });
    return Array.from(unique.values()).sort((left, right) => (
      new Date(right.eventAt || 0).getTime() - new Date(left.eventAt || 0).getTime()
    ));
  }

  function getAuditEventLabel(eventType) {
    return auditEventLabels[String(eventType || "").trim()] || "Order activity";
  }

  return {
    canRejectOrder,
    canUndoRejectOrder,
    createRejectionPatch,
    createUndoRejectionPatch,
    getStatusBeforeRejection,
    getDerivedAuditEvents,
    mergeAuditEvents,
    getAuditEventLabel,
  };
});
