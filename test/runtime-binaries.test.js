const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { resolveExecutablePath, resolvePharmdSftpRuntime } = require("../lib/runtime-binaries");

function makeExecutable(filePath) {
  fs.writeFileSync(filePath, "#!/bin/sh\nexit 0\n", "utf8");
  fs.chmodSync(filePath, 0o755);
}

test("resolveExecutablePath falls back to PATH entries when preferred locations are unavailable", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-runtime-bin-test-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const binDir = path.join(tempRoot, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const expectBinary = path.join(binDir, "expect");
  makeExecutable(expectBinary);

  const result = resolveExecutablePath({
    commandName: "expect",
    preferredPaths: ["/missing/expect"],
    pathValue: binDir,
  });

  assert.equal(result.path, expectBinary);
  assert.deepEqual(result.checkedPaths, ["/missing/expect", expectBinary]);
});

test("resolvePharmdSftpRuntime respects explicit binary overrides and reports missing tools", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-pharmd-runtime-test-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const sftpBinary = path.join(tempRoot, "custom-sftp");
  makeExecutable(sftpBinary);

  const result = resolvePharmdSftpRuntime({
    expectBinary: "/missing/custom-expect",
    sftpBinary,
    pathValue: "",
  });

  assert.equal(result.expectBinary, "");
  assert.equal(result.sftpBinary, sftpBinary);
  assert.deepEqual(result.missing, ["expect"]);
  assert.deepEqual(result.checkedPaths.expect, ["/missing/custom-expect"]);
  assert.deepEqual(result.checkedPaths.sftp, [sftpBinary]);
});
