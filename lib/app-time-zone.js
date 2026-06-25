const FALLBACK_APP_TIME_ZONE = "UTC";

const configuredAppTimeZone = String(
  process.env.LABCENTER_TIME_ZONE
  || process.env.LABCENTER_ACCESSION_TIME_ZONE
  || process.env.TZ
  || FALLBACK_APP_TIME_ZONE
).trim() || FALLBACK_APP_TIME_ZONE;

function isValidAppTimeZone(timeZone) {
  const value = String(timeZone || "").trim();
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function resolveAppTimeZone(timeZone = configuredAppTimeZone) {
  const value = String(timeZone || "").trim() || configuredAppTimeZone;
  return isValidAppTimeZone(value) ? value : FALLBACK_APP_TIME_ZONE;
}

const DEFAULT_APP_TIME_ZONE = resolveAppTimeZone(configuredAppTimeZone);

module.exports = {
  DEFAULT_APP_TIME_ZONE,
  FALLBACK_APP_TIME_ZONE,
  isValidAppTimeZone,
  resolveAppTimeZone,
};
