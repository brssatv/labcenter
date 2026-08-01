function getRequisitionWorkflowApi() {
  const api = window.LabCenterRequisitionWorkflow;
  if (!api) throw new Error("Requisition workflow module is unavailable.");
  return api;
}

function canRejectOrder(order) {
  return getRequisitionWorkflowApi().canRejectOrder(order);
}

async function rejectOrderWithConfirmation(orderId) {
  const normalizedOrderId = String(orderId || "").trim();
  const order = readOrders().find((item) => String(item?.orderId || "").trim() === normalizedOrderId);
  if (!order) throw new Error("Order not found.");
  if (!canRejectOrder(order)) {
    throw new Error(`Order #${normalizedOrderId} cannot be rejected in its current status.`);
  }

  const response = window.prompt(`Enter the reason for rejecting Order #${normalizedOrderId}:`, "");
  if (response === null) return null;
  const reason = String(response).trim();
  if (!reason) {
    alert("A rejection reason is required.");
    return null;
  }
  if (!window.confirm(`Reject Order #${normalizedOrderId}? This will move it to the Rejected queue.`)) return null;

  await updateOrderById(normalizedOrderId, (row) => ({
    ...row,
    ...getRequisitionWorkflowApi().createRejectionPatch(row, {
      at: new Date().toISOString(),
      actor: activeSession?.username || activeSession?.email || activeSession?.type || "clinician",
      reason,
    }),
  }));
  return readOrders().find((item) => String(item?.orderId || "").trim() === normalizedOrderId) || null;
}

async function undoRejectOrderWithConfirmation(orderId) {
  const normalizedOrderId = String(orderId || "").trim();
  const order = readOrders().find((item) => String(item?.orderId || "").trim() === normalizedOrderId);
  if (!order) throw new Error("Order not found.");
  if (!getRequisitionWorkflowApi().canUndoRejectOrder(order)) {
    throw new Error(`Order #${normalizedOrderId} is not rejected.`);
  }
  const restoredStatus = getRequisitionWorkflowApi().getStatusBeforeRejection(order);
  if (!window.confirm(`Undo rejection for Order #${normalizedOrderId}? It will return to ${restoredStatus}.`)) return null;

  await updateOrderById(normalizedOrderId, (row) => ({
    ...row,
    ...getRequisitionWorkflowApi().createUndoRejectionPatch(row, {
      at: new Date().toISOString(),
      actor: activeSession?.username || activeSession?.email || activeSession?.type || "clinician",
    }),
  }));
  return readOrders().find((item) => String(item?.orderId || "").trim() === normalizedOrderId) || null;
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
      body: JSON.stringify({ fileName: file.name, mimeType: file.type || "", contentBase64 }),
    });
  } catch (error) {
    if (String(error?.message || "").includes("404")) {
      throw new Error("Scan import endpoint not found. Restart the server and try again.");
    }
    throw error;
  }
}
