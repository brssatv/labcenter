"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const electronBuildHomeDir = path.join(projectRoot, ".cache", "electron-build-home");
const electronGypDir = path.join(electronBuildHomeDir, ".electron-gyp");
const modulesToRebuild = ["better-sqlite3", "canvas"];

function buildRebuildArgs() {
  return ["-f", ...modulesToRebuild.flatMap((moduleName) => ["-w", moduleName])];
}

function runElectronRebuild() {
  fs.mkdirSync(electronGypDir, { recursive: true });

  const cliPath = path.join(projectRoot, "node_modules", "@electron", "rebuild", "lib", "cli.js");

  if (!fs.existsSync(cliPath)) {
    console.error("electron-rebuild CLI not found. Run `npm install` first.");
    process.exit(1);
  }

  const child = spawn(process.execPath, [cliPath, ...buildRebuildArgs()], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: electronBuildHomeDir,
      USERPROFILE: electronBuildHomeDir,
      npm_config_devdir: electronGypDir,
    },
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });

  child.on("error", (error) => {
    console.error("Failed to launch electron-rebuild.", error);
    process.exit(1);
  });
}

runElectronRebuild();
