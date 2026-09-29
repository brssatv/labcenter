function registerAdminSettingsRoutes({ app, dependencies }) {
  const {
    appSettingsStore,
    auditLog,
    requireDoctorAuth,
  } = dependencies;

  app.get("/api/admin/settings", requireDoctorAuth, (req, res) => {
    return res.json({
      settings: appSettingsStore.getSettings(),
    });
  });

  app.put("/api/admin/settings", requireDoctorAuth, (req, res) => {
    try {
      const pin = String(req.body?.pin || "").trim();
      const timeZone = String(req.body?.timeZone || "").trim();

      if (!/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: "A 4-digit PIN is required." });
      }
      if (!appSettingsStore.verifyTimeZonePin(pin)) {
        auditLog(req, "admin_settings_timezone_update", "denied", {
          reason: "invalid_pin",
        });
        return res.status(403).json({ error: "Invalid admin PIN." });
      }

      const settings = appSettingsStore.updateSettings({
        timeZone,
        showCollectionDate: req.body?.showCollectionDate !== false,
        showCollectionTime: req.body?.showCollectionTime !== false,
        orderHistoryColumns: req.body?.orderHistoryColumns,
      });
      auditLog(req, "admin_settings_update", "success", {
        timeZone: settings.timeZone,
        showCollectionDate: settings.showCollectionDate,
        showCollectionTime: settings.showCollectionTime,
        orderHistoryColumns: settings.orderHistoryColumns,
      });
      return res.json({ settings });
    } catch (error) {
      const message = error?.message || "Unable to update admin settings.";
      const statusCode = /time zone/i.test(message) ? 400 : 500;
      auditLog(req, "admin_settings_update", "failed", {
        reason: message,
      });
      return res.status(statusCode).json({ error: message });
    }
  });
}

module.exports = {
  registerAdminSettingsRoutes,
};
