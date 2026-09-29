const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createAppSettingsStore } = require("../lib/app-settings-store");

test("app settings default to showing collection fields and all history columns", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-settings-"));
  const store = createAppSettingsStore({ dataDir, defaultTimeZone: "UTC" });
  const settings = store.getSettings();

  assert.equal(settings.showCollectionDate, true);
  assert.equal(settings.showCollectionTime, true);
  assert.equal(settings.orderHistoryColumns.length, 10);
});

test("app settings persist display choices and discard unknown columns", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-settings-"));
  const store = createAppSettingsStore({ dataDir, defaultTimeZone: "UTC" });

  store.updateSettings({
    timeZone: "America/Vancouver",
    showCollectionDate: false,
    showCollectionTime: true,
    orderHistoryColumns: ["orderId", "patientDetails", "unknown"],
  });

  const reloaded = createAppSettingsStore({ dataDir, defaultTimeZone: "UTC" }).getSettings();
  assert.deepEqual(reloaded, {
    timeZone: "America/Vancouver",
    showCollectionDate: false,
    showCollectionTime: true,
    orderHistoryColumns: ["orderId", "patientDetails"],
  });
});
