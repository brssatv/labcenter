const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_PHARMD_EXPECT_PATHS = Object.freeze([
  "/usr/bin/expect",
  "/usr/local/bin/expect",
  "/bin/expect",
]);

const DEFAULT_PHARMD_SFTP_PATHS = Object.freeze([
  "/usr/bin/sftp",
  "/usr/local/bin/sftp",
  "/bin/sftp",
]);

function uniqueNonEmpty(values) {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function splitPathEntries(pathValue) {
  return uniqueNonEmpty(String(pathValue || "").split(path.delimiter));
}

function isExecutable(targetPath, accessSync = fs.accessSync) {
  try {
    accessSync(targetPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveExecutablePath({
  commandName,
  configuredPath = "",
  preferredPaths = [],
  pathValue = process.env.PATH,
  accessSync = fs.accessSync,
} = {}) {
  const explicitPath = String(configuredPath || "").trim();
  const checkedPaths = explicitPath
    ? [explicitPath]
    : uniqueNonEmpty([
      ...preferredPaths,
      ...splitPathEntries(pathValue).map((entry) => path.join(entry, commandName)),
    ]);

  for (const candidatePath of checkedPaths) {
    if (isExecutable(candidatePath, accessSync)) {
      return {
        path: candidatePath,
        checkedPaths,
        source: explicitPath ? "configured" : "search",
      };
    }
  }

  return {
    path: "",
    checkedPaths,
    source: explicitPath ? "configured" : "search",
  };
}

function resolvePharmdSftpRuntime({
  expectBinary = "",
  sftpBinary = "",
  pathValue = process.env.PATH,
  accessSync = fs.accessSync,
} = {}) {
  const expectResult = resolveExecutablePath({
    commandName: "expect",
    configuredPath: expectBinary,
    preferredPaths: DEFAULT_PHARMD_EXPECT_PATHS,
    pathValue,
    accessSync,
  });
  const sftpResult = resolveExecutablePath({
    commandName: "sftp",
    configuredPath: sftpBinary,
    preferredPaths: DEFAULT_PHARMD_SFTP_PATHS,
    pathValue,
    accessSync,
  });

  const missing = [];
  if (!expectResult.path) missing.push("expect");
  if (!sftpResult.path) missing.push("sftp");

  return {
    expectBinary: expectResult.path,
    sftpBinary: sftpResult.path,
    missing,
    checkedPaths: {
      expect: expectResult.checkedPaths,
      sftp: sftpResult.checkedPaths,
    },
  };
}

module.exports = {
  resolveExecutablePath,
  resolvePharmdSftpRuntime,
};
