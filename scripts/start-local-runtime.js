const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function printUsage() {
  console.log("Usage: node scripts/start-local-runtime.js <runtime-data-dir>");
  console.log("");
  console.log("Example:");
  console.log("  PORT=43211 npm run start:runtime-data -- ./runtime-data");
}

const dataDirArg = String(process.argv[2] || "").trim();
if (!dataDirArg || dataDirArg === "--help" || dataDirArg === "-h") {
  printUsage();
  process.exit(dataDirArg ? 0 : 1);
}

const dataDir = path.resolve(process.cwd(), dataDirArg);
if (!fs.existsSync(dataDir) || !fs.statSync(dataDir).isDirectory()) {
  console.error(`[runtime-data] Directory not found: ${dataDir}`);
  process.exit(1);
}

const sessionDir = process.env.SESSION_DIR
  ? path.resolve(process.cwd(), process.env.SESSION_DIR)
  : path.join(dataDir, "sessions");

const requiredFiles = ["facility.json"];
const recommendedFiles = ["users.json", "labcenter.sqlite"];

const missingRequired = requiredFiles.filter((name) => !fs.existsSync(path.join(dataDir, name)));
if (missingRequired.length) {
  console.error(
    `[runtime-data] Missing required file(s) in ${dataDir}: ${missingRequired.join(", ")}`
  );
  process.exit(1);
}

const missingRecommended = recommendedFiles.filter((name) => !fs.existsSync(path.join(dataDir, name)));
if (missingRecommended.length) {
  console.warn(
    `[runtime-data] Missing optional file(s): ${missingRecommended.join(", ")}`
  );
  console.warn("[runtime-data] Facility data will load, but local may not fully match production.");
}

console.log(`[runtime-data] DATA_DIR=${dataDir}`);
console.log(`[runtime-data] SESSION_DIR=${sessionDir}`);
if (process.env.PORT) {
  console.log(`[runtime-data] PORT=${process.env.PORT}`);
}

const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
  cwd: path.join(__dirname, ".."),
  stdio: "inherit",
  env: {
    ...process.env,
    DATA_DIR: dataDir,
    SESSION_DIR: sessionDir,
  },
});

function forwardSignal(signal) {
  if (!child.killed) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

