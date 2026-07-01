const fs = require("fs");
const path = require("path");
const { DEFAULT_APP_TIME_ZONE, isValidAppTimeZone, resolveAppTimeZone } = require("./app-time-zone");

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function readSettingsFile(settingsPath) {
  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeSettings(input, defaults = {}) {
  const raw = input && typeof input === "object" ? input : {};
  const fallbackTimeZone = resolveAppTimeZone(defaults.timeZone || DEFAULT_APP_TIME_ZONE);
  const requestedTimeZone = String(raw.timeZone || fallbackTimeZone).trim();
  return {
    timeZone: isValidAppTimeZone(requestedTimeZone)
      ? requestedTimeZone
      : fallbackTimeZone,
  };
}

function createAppSettingsStore({
  dataDir,
  defaultTimeZone = DEFAULT_APP_TIME_ZONE,
  timeZonePin = String(process.env.LABCENTER_TIME_ZONE_PIN || "9876").trim() || "9876",
} = {}) {
  const settingsPath = path.join(dataDir, "app-settings.json");
  const baseSettings = sanitizeSettings({ timeZone: defaultTimeZone }, { timeZone: DEFAULT_APP_TIME_ZONE });
  let currentSettings = sanitizeSettings(readSettingsFile(settingsPath), baseSettings);

  function persistSettings() {
    ensureDir(path.dirname(settingsPath));
    fs.writeFileSync(settingsPath, `${JSON.stringify(currentSettings, null, 2)}\n`, "utf8");
  }

  return {
    settingsPath,
    getSettings() {
      return { ...currentSettings };
    },
    getTimeZone() {
      return currentSettings.timeZone;
    },
    verifyAdminPin(pin) {
      return String(pin || "").trim() === timeZonePin;
    },
    verifyTimeZonePin(pin) {
      return String(pin || "").trim() === timeZonePin;
    },
    updateTimeZone(nextTimeZone) {
      const raw = String(nextTimeZone || "").trim();
      if (!raw) {
        throw new Error("Time zone is required.");
      }
      if (!isValidAppTimeZone(raw)) {
        throw new Error("Time zone must be a valid IANA identifier.");
      }
      currentSettings = {
        ...currentSettings,
        timeZone: raw,
      };
      persistSettings();
      return { ...currentSettings };
    },
  };
}

module.exports = {
  createAppSettingsStore,
};
