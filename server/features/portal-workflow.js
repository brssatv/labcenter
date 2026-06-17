const { DEFAULT_ACCESSION_TIME_ZONE } = require("../../lib/accession-number");
const { prepareOrdersForBulkSave } = require("./portal-order-accessions");

function registerPortalWorkflowRoutes({ app, dependencies }) {
  const {
    auditLog,
    buildPatientProfileArtifacts,
    canAccessOrderRecord,
    getPortalDataForSession,
    hasRequisitionAccess,
    orderIdPadLength,
    orderIdStartNumber,
    portalStore,
    requireAuthenticatedUser,
    requireDoctorAuth,
  } = dependencies;

  app.get("/api/portal/data", requireAuthenticatedUser, (req, res) => {
    try {
      return res.json(getPortalDataForSession(req));
    } catch (error) {
      auditLog(req, "portal_data_load", "failed", {
        reason: error?.message || "unexpected_error",
      });
      return res.status(500).json({ error: "Unable to load portal data." });
    }
  });

  app.post("/api/portal/import-local", requireDoctorAuth, (req, res) => {
    try {
      const payload = {
        registrations: Array.isArray(req.body?.registrations) ? req.body.registrations : [],
        orders: Array.isArray(req.body?.orders) ? req.body.orders : [],
        uploadResultsLog: Array.isArray(req.body?.uploadResultsLog) ? req.body.uploadResultsLog : [],
      };
      const imported = portalStore.importLocalData(payload);
      auditLog(req, "portal_local_import", "success", imported);
      return res.json({
        imported,
        ...getPortalDataForSession(req),
      });
    } catch (error) {
      auditLog(req, "portal_local_import", "failed", {
        reason: error?.message || "unexpected_error",
      });
      return res.status(500).json({ error: "Unable to import existing browser data." });
    }
  });

  app.post("/api/portal/order-ids", requireAuthenticatedUser, (req, res) => {
    if (!hasRequisitionAccess(req)) {
      return res.status(401).json({ error: "Order creation access is not enabled for this account." });
    }

    try {
      const requestedCount = Number(req.body?.count || 0);
      const count = Math.max(1, Math.min(100, Math.floor(requestedCount || 1)));
      const orderIds = portalStore.reserveOrderIds({
        count,
        startAt: orderIdStartNumber,
        padLength: orderIdPadLength,
      });
      auditLog(req, "order_id_reserve", "success", { count });
      return res.json({ orderIds });
    } catch (error) {
      auditLog(req, "order_id_reserve", "failed", {
        reason: error?.message || "unexpected_error",
      });
      return res.status(500).json({ error: "Unable to reserve order IDs." });
    }
  });

  app.post("/api/portal/registrations", requireAuthenticatedUser, (req, res) => {
    if (!hasRequisitionAccess(req)) {
      return res.status(401).json({ error: "Registration access is not enabled for this account." });
    }

    try {
      const registration = req.body?.registration && typeof req.body.registration === "object" ? req.body.registration : null;
      if (!registration) {
        return res.status(400).json({ error: "Registration payload is required." });
      }

      const saved = portalStore.upsertRegistration({
        ...registration,
        createdAt: registration.createdAt || new Date().toISOString(),
      });

      auditLog(req, "registration_save", "success", {
        patientId: saved.patientId || "",
      });
      return res.json({
        registration: saved,
        totalCount: portalStore.countRegistrations(),
      });
    } catch (error) {
      auditLog(req, "registration_save", "failed", {
        reason: error?.message || "unexpected_error",
      });
      return res.status(500).json({ error: "Unable to save registration." });
    }
  });

  app.patch("/api/portal/patients/:patientId", requireDoctorAuth, (req, res) => {
    try {
      const patientId = String(req.params?.patientId || "").trim();
      const patient = req.body?.patient && typeof req.body.patient === "object" ? req.body.patient : null;
      if (!patientId) {
        return res.status(400).json({ error: "Patient ID is required." });
      }
      if (!patient) {
        return res.status(400).json({ error: "Patient payload is required." });
      }

      const matchingRegistrations = portalStore.listRegistrationsByPatientId(patientId);
      const matchingOrders = portalStore.listOrders().filter((order) => String(order?.patientId || "").trim() === patientId);
      const updateArtifacts = buildPatientProfileArtifacts({
        patientId,
        patient,
        registrations: matchingRegistrations,
        orders: matchingOrders,
      });
      const savedRegistrations = matchingRegistrations.length
        ? portalStore.replaceRegistrations(updateArtifacts.registrationUpdates)
        : [portalStore.upsertRegistration(updateArtifacts.registrationUpdates[0])];

      if (updateArtifacts.orderUpdates.length) {
        portalStore.upsertOrders(updateArtifacts.orderUpdates);
      }

      auditLog(req, "patient_update", "success", {
        patientId,
        updatedRegistrations: savedRegistrations.length,
        updatedOrders: updateArtifacts.orderUpdates.length,
      });
      return res.json({
        patient: savedRegistrations[0] || updateArtifacts.nextProfile,
        updatedRegistrations: savedRegistrations.length,
        updatedOrders: updateArtifacts.orderUpdates.length,
        ...getPortalDataForSession(req),
      });
    } catch (error) {
      auditLog(req, "patient_update", "failed", {
        patientId: String(req.params?.patientId || "").trim(),
        reason: error?.message || "unexpected_error",
      });
      return res.status(500).json({ error: "Unable to update patient record." });
    }
  });

  app.post("/api/portal/orders/bulk", requireAuthenticatedUser, (req, res) => {
    if (!hasRequisitionAccess(req)) {
      return res.status(401).json({ error: "Order creation access is not enabled for this account." });
    }

    try {
      const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
      if (!orders.length) {
        return res.status(400).json({ error: "One or more orders are required." });
      }
      const nowIso = new Date().toISOString();
      const preparedOrders = prepareOrdersForBulkSave({
        orders,
        portalStore,
        requestReceivedAt: nowIso,
        timeZone: DEFAULT_ACCESSION_TIME_ZONE,
      });
      const savedOrders = portalStore.upsertOrders(preparedOrders);
      auditLog(req, "orders_bulk_save", "success", {
        count: savedOrders.length,
      });
      return res.json({ orders: savedOrders });
    } catch (error) {
      auditLog(req, "orders_bulk_save", "failed", {
        reason: error?.message || "unexpected_error",
      });
      return res.status(500).json({ error: "Unable to save orders." });
    }
  });

  app.put("/api/portal/orders/:orderId", requireAuthenticatedUser, (req, res) => {
    try {
      const current = portalStore.getOrderById(req.params.orderId);
      if (!current) {
        return res.status(404).json({ error: "Order not found." });
      }
      if (!canAccessOrderRecord(req, current)) {
        return res.status(404).json({ error: "Order not found." });
      }

      const order = req.body?.order && typeof req.body.order === "object" ? req.body.order : null;
      if (!order) {
        return res.status(400).json({ error: "Order payload is required." });
      }

      const nowIso = new Date().toISOString();
      const saved = portalStore.upsertOrders([
        {
          ...current,
          ...order,
          orderId: String(req.params.orderId || current.orderId || "").trim(),
          createdAt: order?.createdAt || current.createdAt || nowIso,
          updatedAt: nowIso,
        },
      ])[0];

      auditLog(req, "order_update", "success", {
        orderId: saved.orderId,
        status: saved.status,
      });
      return res.json({ order: saved });
    } catch (error) {
      auditLog(req, "order_update", "failed", {
        orderId: String(req.params.orderId || ""),
        reason: error?.message || "unexpected_error",
      });
      return res.status(500).json({ error: "Unable to update order." });
    }
  });

  app.post("/api/portal/upload-log", requireAuthenticatedUser, (req, res) => {
    try {
      const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
      if (!entries.length) {
        return res.status(400).json({ error: "One or more upload log entries are required." });
      }
      portalStore.appendUploadLogs(entries);
      auditLog(req, "upload_log_append", "success", {
        count: entries.length,
      });
      return res.json(getPortalDataForSession(req));
    } catch (error) {
      auditLog(req, "upload_log_append", "failed", {
        reason: error?.message || "unexpected_error",
      });
      return res.status(500).json({ error: "Unable to save upload activity." });
    }
  });
}

module.exports = {
  registerPortalWorkflowRoutes,
};
