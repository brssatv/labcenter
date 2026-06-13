const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");

const {
  Server,
  utils: {
    generateKeyPairSync,
    sftp: { OPEN_MODE, STATUS_CODE },
  },
} = require("ssh2");

function createCookieJar() {
  const jar = new Map();
  return {
    merge(headers) {
      const setCookies = typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : (headers.get("set-cookie") ? [headers.get("set-cookie")] : []);
      setCookies.forEach((cookie) => {
        const firstPart = String(cookie || "").split(";")[0];
        const eqIndex = firstPart.indexOf("=");
        if (eqIndex <= 0) return;
        const name = firstPart.slice(0, eqIndex);
        const value = firstPart.slice(eqIndex + 1);
        jar.set(name, value);
      });
    },
    header() {
      return Array.from(jar.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    },
  };
}

function normalizeRemotePath(value) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "");
}

function assembleChunks(chunks) {
  const totalSize = chunks.reduce((maxSize, chunk) => {
    const offset = Number(chunk.offset || 0);
    return Math.max(maxSize, offset + chunk.data.length);
  }, 0);
  const output = Buffer.alloc(totalSize);
  chunks.forEach((chunk) => {
    chunk.data.copy(output, Number(chunk.offset || 0));
  });
  return output;
}

async function createSamplePdfBuffer(label, width = 400, height = 250) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([width, height]);
  page.drawText(String(label || "Sample PDF"), {
    x: 32,
    y: height - 52,
    size: 18,
  });
  return Buffer.from(await pdf.save());
}

async function startTestSftpServer({
  username = "jays-user",
  password = "top-secret",
  remoteDir = "oru",
  seededFiles = {},
} = {}) {
  const remoteRoot = normalizeRemotePath(remoteDir);
  const uploadedFiles = new Map();
  const remoteFiles = new Map(
    Object.entries(seededFiles || {}).map(([remotePath, content]) => {
      const normalized = normalizeRemotePath(remotePath);
      const buffer = Buffer.isBuffer(content) ? Buffer.from(content) : Buffer.from(String(content || ""), "utf8");
      return [normalized, { buffer, mtime: Math.floor(Date.now() / 1000) }];
    })
  );
  const { private: privateKey } = generateKeyPairSync("ed25519");
  let nextHandleId = 1;

  const directoryExists = (dirPath) => {
    const normalized = normalizeRemotePath(dirPath);
    if (!normalized) return true;
    if (normalized === remoteRoot) return true;
    return Array.from(remoteFiles.keys()).some((filePath) => filePath.startsWith(`${normalized}/`));
  };

  const buildDirEntries = (dirPath) => {
    const normalized = normalizeRemotePath(dirPath);
    const entries = [];
    Array.from(remoteFiles.entries()).forEach(([filePath, file]) => {
      if (path.posix.dirname(filePath) !== normalized) return;
      entries.push({
        filename: path.posix.basename(filePath),
        longname: path.posix.basename(filePath),
        attrs: {
          mode: 0o100644,
          size: file.buffer.length,
          mtime: file.mtime,
        },
      });
    });
    return entries;
  };

  const server = new Server({ hostKeys: [privateKey] }, (client) => {
    client.on("authentication", (ctx) => {
      if (ctx.method === "password" && ctx.username === username && ctx.password === password) {
        ctx.accept();
        return;
      }
      ctx.reject();
    }).on("ready", () => {
      client.on("session", (accept) => {
        const session = accept();
        session.on("sftp", (acceptSftp) => {
          const sftp = acceptSftp();
          const openHandles = new Map();

          const makeHandle = (value) => {
            const handle = Buffer.alloc(4);
            handle.writeUInt32BE(nextHandleId, 0);
            openHandles.set(nextHandleId, value);
            nextHandleId += 1;
            return handle;
          };

          const readHandle = (buffer) => openHandles.get(buffer.readUInt32BE(0));

          sftp.on("OPENDIR", (reqid, dirPath) => {
            const normalized = normalizeRemotePath(dirPath);
            if (!directoryExists(normalized)) {
              sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
              return;
            }
            sftp.handle(reqid, makeHandle({ type: "dir", dirPath: normalized, hasRead: false }));
          }).on("READDIR", (reqid, handle) => {
            const entry = readHandle(handle);
            if (!entry || entry.type !== "dir") {
              sftp.status(reqid, STATUS_CODE.FAILURE);
              return;
            }
            if (entry.hasRead) {
              sftp.status(reqid, STATUS_CODE.EOF);
              return;
            }
            entry.hasRead = true;
            const entries = buildDirEntries(entry.dirPath);
            if (!entries.length) {
              sftp.status(reqid, STATUS_CODE.EOF);
              return;
            }
            sftp.name(reqid, entries);
          }).on("LSTAT", (reqid, targetPath) => {
            const normalized = normalizeRemotePath(targetPath);
            if (directoryExists(normalized) && !remoteFiles.has(normalized)) {
              sftp.attrs(reqid, { mode: 0o040755 });
              return;
            }
            const file = remoteFiles.get(normalized);
            if (file) {
              sftp.attrs(reqid, { mode: 0o100644, size: file.buffer.length, mtime: file.mtime });
              return;
            }
            sftp.status(reqid, STATUS_CODE.EOF);
          }).on("OPEN", (reqid, filename, flags) => {
            const normalized = normalizeRemotePath(filename);
            if (flags & OPEN_MODE.WRITE) {
              if (path.posix.dirname(normalized) !== remoteRoot) {
                sftp.status(reqid, STATUS_CODE.FAILURE);
                return;
              }
              sftp.handle(reqid, makeHandle({
                type: "file-write",
                remotePath: normalized,
                chunks: [],
              }));
              return;
            }
            if (!remoteFiles.has(normalized)) {
              sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
              return;
            }
            sftp.handle(reqid, makeHandle({
              type: "file-read",
              remotePath: normalized,
            }));
          }).on("WRITE", (reqid, handle, offset, data) => {
            const entry = readHandle(handle);
            if (!entry || entry.type !== "file-write") {
              sftp.status(reqid, STATUS_CODE.FAILURE);
              return;
            }
            entry.chunks.push({
              offset: Number(offset || 0),
              data: Buffer.from(data),
            });
            sftp.status(reqid, STATUS_CODE.OK);
          }).on("READ", (reqid, handle, offset, length) => {
            const entry = readHandle(handle);
            if (!entry || entry.type !== "file-read") {
              sftp.status(reqid, STATUS_CODE.FAILURE);
              return;
            }
            const file = remoteFiles.get(entry.remotePath);
            if (!file) {
              sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
              return;
            }
            const start = Math.max(0, Number(offset || 0));
            const end = Math.min(file.buffer.length, start + Math.max(0, Number(length || 0)));
            if (start >= end) {
              sftp.status(reqid, STATUS_CODE.EOF);
              return;
            }
            sftp.data(reqid, file.buffer.subarray(start, end));
          }).on("CLOSE", (reqid, handle) => {
            const key = handle.readUInt32BE(0);
            const entry = openHandles.get(key);
            if (!entry) {
              sftp.status(reqid, STATUS_CODE.FAILURE);
              return;
            }
            if (entry.type === "file-write") {
              const buffer = assembleChunks(entry.chunks);
              uploadedFiles.set(entry.remotePath, buffer);
              remoteFiles.set(entry.remotePath, {
                buffer,
                mtime: Math.floor(Date.now() / 1000),
              });
            }
            openHandles.delete(key);
            sftp.status(reqid, STATUS_CODE.OK);
          }).on("REALPATH", (reqid, givenPath) => {
            const normalized = normalizeRemotePath(givenPath) || ".";
            sftp.name(reqid, [{
              filename: normalized,
              longname: normalized,
              attrs: {},
            }]);
          }).on("STAT", (reqid, targetPath) => {
            const normalized = normalizeRemotePath(targetPath);
            if (directoryExists(normalized) && !remoteFiles.has(normalized)) {
              sftp.attrs(reqid, { mode: 0o040755 });
              return;
            }
            const file = remoteFiles.get(normalized);
            if (file) {
              sftp.attrs(reqid, { mode: 0o100644, size: file.buffer.length, mtime: file.mtime });
              return;
            }
            sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
          }).on("FSTAT", (reqid, handle) => {
            const entry = readHandle(handle);
            if (!entry || entry.type !== "file-read") {
              sftp.status(reqid, STATUS_CODE.FAILURE);
              return;
            }
            const file = remoteFiles.get(entry.remotePath);
            if (!file) {
              sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
              return;
            }
            sftp.attrs(reqid, { mode: 0o100644, size: file.buffer.length, mtime: file.mtime });
          }).on("SETSTAT", (reqid) => {
            sftp.status(reqid, STATUS_CODE.OK);
          }).on("FSETSTAT", (reqid) => {
            sftp.status(reqid, STATUS_CODE.OK);
          });
        });
      });
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  return {
    uploadedFiles,
    port: server.address().port,
    remoteFiles,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function startPharmdHarness(envOverrides = {}, seedOrder = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-pharmd-send-test-"));
  const dataDir = path.join(tempRoot, "runtime-data");
  const sessionDir = path.join(tempRoot, "sessions");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });

  const originalEnv = {
    DATA_DIR: process.env.DATA_DIR,
    SESSION_DIR: process.env.SESSION_DIR,
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
    PHARMD_SFTP_HOST: process.env.PHARMD_SFTP_HOST,
    PHARMD_SFTP_PORT: process.env.PHARMD_SFTP_PORT,
    PHARMD_SFTP_USERNAME: process.env.PHARMD_SFTP_USERNAME,
    PHARMD_SFTP_PASSWORD: process.env.PHARMD_SFTP_PASSWORD,
    PHARMD_SFTP_ORU_DIR: process.env.PHARMD_SFTP_ORU_DIR,
    PHARMD_SFTP_PDF_DIR: process.env.PHARMD_SFTP_PDF_DIR,
    PHARMD_SFTP_TIMEOUT_SEC: process.env.PHARMD_SFTP_TIMEOUT_SEC,
    PHARMD_SFTP_RECEIPT_INTERVAL_SEC: process.env.PHARMD_SFTP_RECEIPT_INTERVAL_SEC,
    PHARMD_SFTP_RECEIPT_MAX_CHECKS: process.env.PHARMD_SFTP_RECEIPT_MAX_CHECKS,
    PHARMD_SFTP_POLL_INTERVAL_SEC: process.env.PHARMD_SFTP_POLL_INTERVAL_SEC,
  };

  process.env.DATA_DIR = dataDir;
  process.env.SESSION_DIR = sessionDir;
  process.env.PORT = "0";
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "test-secret-for-pharmd-send-route";
  Object.entries(envOverrides || {}).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  });

  const serverPath = require.resolve("../server.js");
  delete require.cache[serverPath];
  const { startServer, portalStore, pollPharmdReceiptFolderOnce, triggerPharmdReceiptPoll } = require("../server.js");

  portalStore.upsertOrders([
    {
      orderId: "00001",
      patientId: "9001",
      patientName: "PharmD Patient",
      provider: "Workflow Provider",
      facilityName: "Workflow Facility",
      status: "Processed",
      createdAt: "2026-06-01T08:00:00.000Z",
      updatedAt: "2026-06-01T08:00:00.000Z",
      pharmd: {
        oruMessage: "MSH|^~\\&|LabCenter|Clinic|PharmD|CPD|20260601080000||ORU^R01|CTRL-1|P|2.5.1",
        messageFileName: "Order_00001_PharmD_ORU.hl7",
      },
      ...seedOrder,
    },
  ]);

  const server = await startServer(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const cookieJar = createCookieJar();

  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf-token`);
  cookieJar.merge(csrfResponse.headers);
  const csrfPayload = await csrfResponse.json();

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieJar.header(),
      "x-csrf-token": csrfPayload.csrfToken,
    },
    body: JSON.stringify({
      identifier: "admin@clinic.local",
      password: "ChangeMeNow!123",
    }),
  });
  cookieJar.merge(loginResponse.headers);
  const loginPayload = await loginResponse.json();
  assert.equal(loginResponse.status, 200);
  assert.ok(loginPayload.authenticated);
  assert.ok(loginPayload.csrfToken);

  return {
    baseUrl,
    cookieJar,
    csrfToken: loginPayload.csrfToken,
    dataDir,
    pollPharmdReceiptFolderOnce,
    portalStore,
    triggerPharmdReceiptPoll,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      delete require.cache[serverPath];
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    },
  };
}

test("PharmD send route uploads the ORU message through native ssh2 SFTP", async (t) => {
  const sftpServer = await startTestSftpServer({
    username: "labuser",
    password: "top-secret",
    remoteDir: "oru",
    seededFiles: {
      "pharmd-pdf2/placeholder.txt": "noop",
    },
  });
  t.after(async () => {
    await sftpServer.close();
  });

  const harness = await startPharmdHarness({
    PHARMD_SFTP_HOST: "127.0.0.1",
    PHARMD_SFTP_PORT: String(sftpServer.port),
    PHARMD_SFTP_USERNAME: "labuser",
    PHARMD_SFTP_PASSWORD: "top-secret",
    PHARMD_SFTP_ORU_DIR: "oru",
    PHARMD_SFTP_TIMEOUT_SEC: "10",
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.baseUrl}/api/pharmd/orders/00001/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.match(payload.message, /oru\/Order_00001_PharmD_ORU\.hl7/);

  const storedOrder = harness.portalStore.getOrderById("00001");
  assert.equal(storedOrder?.pharmd?.sendStatus, "sent");
  assert.equal(storedOrder?.pharmd?.remotePath, "oru/Order_00001_PharmD_ORU.hl7");
  assert.equal(storedOrder?.pharmd?.receiptRemoteDir, "pharmd-pdf2");
  assert.equal(storedOrder?.pharmd?.receiptIntervalSec, 1200);
  assert.equal(storedOrder?.pharmd?.receiptMaxChecks, 5);
  assert.equal(storedOrder?.pharmd?.receiptAutoCheckCount, 0);
  assert.equal(storedOrder?.pharmd?.receiptManualCheckCount, 0);
  assert.equal(storedOrder?.pharmd?.receiptPollingStatus, "pending");
  assert.ok(storedOrder?.pharmd?.receiptNextCheckAt);

  const uploaded = sftpServer.uploadedFiles.get("oru/Order_00001_PharmD_ORU.hl7");
  assert.ok(uploaded);
  assert.equal(
    uploaded.toString("utf8"),
    "MSH|^~\\&|LabCenter|Clinic|PharmD|CPD|20260601080000||ORU^R01|CTRL-1|P|2.5.1"
  );
});

test("PharmD send route returns a clear error when the configured remote folder is missing", async (t) => {
  const sftpServer = await startTestSftpServer({
    username: "labuser",
    password: "top-secret",
    remoteDir: "oru",
    seededFiles: {
      "pharmd-pdf2/placeholder.txt": "noop",
    },
  });
  t.after(async () => {
    await sftpServer.close();
  });

  const harness = await startPharmdHarness({
    PHARMD_SFTP_HOST: "127.0.0.1",
    PHARMD_SFTP_PORT: String(sftpServer.port),
    PHARMD_SFTP_USERNAME: "labuser",
    PHARMD_SFTP_PASSWORD: "top-secret",
    PHARMD_SFTP_ORU_DIR: "missing",
    PHARMD_SFTP_TIMEOUT_SEC: "10",
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.baseUrl}/api/pharmd/orders/00001/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.message, "Remote directory 'missing' was not found.");

  const storedOrder = harness.portalStore.getOrderById("00001");
  assert.equal(storedOrder?.pharmd?.sendStatus, "error");
  assert.equal(storedOrder?.pharmd?.lastError, "Remote directory 'missing' was not found.");
});

test("PharmD manual receipt check stores a matched pharmd-pdf2 file for the order accession", async (t) => {
  const accessionNo = "UT1504202600003";
  const sftpServer = await startTestSftpServer({
    username: "labuser",
    password: "top-secret",
    remoteDir: "oru",
    seededFiles: {
      [`pharmd-pdf2/${accessionNo}_PharmD_Report.pdf`]: "%PDF-pharmd-report",
    },
  });
  t.after(async () => {
    await sftpServer.close();
  });

  const harness = await startPharmdHarness({
    PHARMD_SFTP_HOST: "127.0.0.1",
    PHARMD_SFTP_PORT: String(sftpServer.port),
    PHARMD_SFTP_USERNAME: "labuser",
    PHARMD_SFTP_PASSWORD: "top-secret",
    PHARMD_SFTP_ORU_DIR: "oru",
    PHARMD_SFTP_PDF_DIR: "pharmd-pdf2",
    PHARMD_SFTP_TIMEOUT_SEC: "10",
  }, {
    accessionNo,
    pharmd: {
      oruMessage: "MSH|^~\\&|LabCenter|Clinic|PharmD|CPD|20260601080000||ORU^R01|CTRL-1|P|2.5.1",
      messageFileName: `${accessionNo}_PharmD_ORU.hl7`,
      sentAt: "2026-06-01T08:30:00.000Z",
      sendStatus: "sent",
      remotePath: `oru/${accessionNo}_PharmD_ORU.hl7`,
      receiptRemoteDir: "pharmd-pdf2",
      receiptIntervalSec: 1200,
      receiptMaxChecks: 5,
      receiptNextCheckAt: "2026-06-01T08:50:00.000Z",
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.baseUrl}/api/pharmd/orders/00001/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.ok, true);
  assert.equal(payload.found, true);
  assert.equal(payload.summary?.checkedOrders, 1);
  assert.equal(payload.summary?.matchedOrders, 1);

  const previewResponse = await fetch(`${harness.baseUrl}/api/pharmd/orders/00001/receipt-file`, {
    headers: {
      Cookie: harness.cookieJar.header(),
    },
  });
  assert.equal(previewResponse.status, 200);
  assert.equal(previewResponse.headers.get("content-type"), "application/pdf");
  assert.equal(await previewResponse.text(), "%PDF-pharmd-report");

  const storedOrder = harness.portalStore.getOrderById("00001");
  assert.equal(storedOrder?.pharmd?.sendStatus, "received");
  assert.equal(storedOrder?.pharmd?.deliveryStatus, "received");
  assert.equal(storedOrder?.pharmd?.reportReceivedAccession, accessionNo);
  assert.equal(storedOrder?.pharmd?.reportReceivedMatchedBy, "accession");
  assert.equal(storedOrder?.pharmd?.reportReceivedFileName, `${accessionNo}_PharmD_Report.pdf`);
  assert.equal(storedOrder?.pharmd?.reportReceivedRemotePath, `pharmd-pdf2/${accessionNo}_PharmD_Report.pdf`);
  assert.ok(storedOrder?.pharmd?.reportReceivedAt);
  assert.equal(storedOrder?.pharmd?.receiptLastCheckSource, "manual");
  assert.equal(storedOrder?.pharmd?.receiptLastCheckResult, "matched");
  assert.equal(storedOrder?.pharmd?.receivedReport?.bucket, "local");
  assert.ok(storedOrder?.pharmd?.receivedReport?.key);
  assert.ok(fs.existsSync(path.join(harness.dataDir, storedOrder.pharmd.receivedReport.key)));
  assert.equal(
    fs.readFileSync(path.join(harness.dataDir, storedOrder.pharmd.receivedReport.key), "utf8"),
    "%PDF-pharmd-report"
  );
});

test("PharmD manual receipt check falls back to the order number when the accession is not in the filename", async (t) => {
  const accessionNo = "UT1504202600004";
  const sftpServer = await startTestSftpServer({
    username: "labuser",
    password: "top-secret",
    remoteDir: "oru",
    seededFiles: {
      "pharmd-pdf2/Order_00001_Processed_Report.pdf": "%PDF-pharmd-order-fallback",
    },
  });
  t.after(async () => {
    await sftpServer.close();
  });

  const harness = await startPharmdHarness({
    PHARMD_SFTP_HOST: "127.0.0.1",
    PHARMD_SFTP_PORT: String(sftpServer.port),
    PHARMD_SFTP_USERNAME: "labuser",
    PHARMD_SFTP_PASSWORD: "top-secret",
    PHARMD_SFTP_ORU_DIR: "oru",
    PHARMD_SFTP_PDF_DIR: "pharmd-pdf2",
    PHARMD_SFTP_TIMEOUT_SEC: "10",
  }, {
    orderId: "00001",
    accessionNo,
    pharmd: {
      oruMessage: "MSH|^~\\&|LabCenter|Clinic|PharmD|CPD|20260601080000||ORU^R01|CTRL-4|P|2.5.1",
      messageFileName: `${accessionNo}_PharmD_ORU.hl7`,
      sentAt: "2026-06-01T08:30:00.000Z",
      sendStatus: "sent",
      remotePath: `oru/${accessionNo}_PharmD_ORU.hl7`,
      receiptRemoteDir: "pharmd-pdf2",
      receiptIntervalSec: 1200,
      receiptMaxChecks: 5,
      receiptNextCheckAt: "2026-06-01T08:50:00.000Z",
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.baseUrl}/api/pharmd/orders/00001/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: harness.cookieJar.header(),
      "x-csrf-token": harness.csrfToken,
    },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.ok, true);
  assert.equal(payload.found, true);
  assert.equal(payload.summary?.checkedOrders, 1);
  assert.equal(payload.summary?.matchedOrders, 1);

  const storedOrder = harness.portalStore.getOrderById("00001");
  assert.equal(storedOrder?.pharmd?.sendStatus, "received");
  assert.equal(storedOrder?.pharmd?.reportReceivedAccession, accessionNo);
  assert.equal(storedOrder?.pharmd?.reportReceivedMatchedBy, "order_id");
  assert.equal(storedOrder?.pharmd?.reportReceivedFileName, "Order_00001_Processed_Report.pdf");
  assert.equal(storedOrder?.pharmd?.reportReceivedRemotePath, "pharmd-pdf2/Order_00001_Processed_Report.pdf");
});

test("PharmD combined report preview joins the PharmD file before the saved final report", async (t) => {
  const harness = await startPharmdHarness();
  t.after(async () => {
    await harness.close();
  });

  const finalPdf = await createSamplePdfBuffer("Final Report Page", 420, 280);
  const pharmdPdf = await createSamplePdfBuffer("PharmD Page", 280, 420);
  const finalKey = "generated-reports/final/00001/final-preview.pdf";
  const pharmdKey = "pharmd-receipts/00001/pharmd-preview.pdf";
  const finalPath = path.join(harness.dataDir, finalKey);
  const pharmdPath = path.join(harness.dataDir, pharmdKey);
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.mkdirSync(path.dirname(pharmdPath), { recursive: true });
  fs.writeFileSync(finalPath, finalPdf);
  fs.writeFileSync(pharmdPath, pharmdPdf);

  const current = harness.portalStore.getOrderById("00001");
  const nowIso = new Date().toISOString();
  harness.portalStore.upsertOrders([
    {
      ...current,
      updatedAt: nowIso,
      generatedReports: {
        ...(current?.generatedReports || {}),
        final: {
          bucket: "local",
          key: finalKey,
          storageType: "local",
          fileName: "Order_00001_Final_Report.pdf",
          mimeType: "application/pdf",
          sizeBytes: finalPdf.length,
          generatedAt: nowIso,
        },
      },
      pharmd: {
        ...((current?.pharmd && typeof current.pharmd === "object") ? current.pharmd : {}),
        reportReceivedAt: nowIso,
        receivedReport: {
          bucket: "local",
          key: pharmdKey,
          storageType: "local",
          fileName: "Order_00001_PharmD_Report.pdf",
          mimeType: "application/pdf",
          sizeBytes: pharmdPdf.length,
          createdAt: nowIso,
        },
      },
    },
  ]);

  const response = await fetch(`${harness.baseUrl}/api/pharmd/orders/00001/combined-report-pdf`, {
    headers: {
      Cookie: harness.cookieJar.header(),
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");

  const combinedBuffer = Buffer.from(await response.arrayBuffer());
  const combinedPdf = await PDFDocument.load(combinedBuffer);
  assert.equal(combinedPdf.getPageCount(), 2);
  const [firstPage, secondPage] = combinedPdf.getPages();
  assert.deepEqual(firstPage.getSize(), { width: 280, height: 420 });
  assert.deepEqual(secondPage.getSize(), { width: 420, height: 280 });
});

test("PharmD auto receipt polling stops after five misses and manual checks can still retry later", async (t) => {
  const accessionNo = "UT1504202600099";
  const sftpServer = await startTestSftpServer({
    username: "labuser",
    password: "top-secret",
    remoteDir: "oru",
    seededFiles: {
      "pharmd-pdf2/placeholder.txt": "noop",
    },
  });
  t.after(async () => {
    await sftpServer.close();
  });

  const harness = await startPharmdHarness({
    PHARMD_SFTP_HOST: "127.0.0.1",
    PHARMD_SFTP_PORT: String(sftpServer.port),
    PHARMD_SFTP_USERNAME: "labuser",
    PHARMD_SFTP_PASSWORD: "top-secret",
    PHARMD_SFTP_ORU_DIR: "oru",
    PHARMD_SFTP_PDF_DIR: "pharmd-pdf2",
    PHARMD_SFTP_RECEIPT_INTERVAL_SEC: "1200",
    PHARMD_SFTP_RECEIPT_MAX_CHECKS: "5",
    PHARMD_SFTP_TIMEOUT_SEC: "10",
  }, {
    accessionNo,
    pharmd: {
      oruMessage: "MSH|^~\\&|LabCenter|Clinic|PharmD|CPD|20260601080000||ORU^R01|CTRL-99|P|2.5.1",
      messageFileName: `${accessionNo}_PharmD_ORU.hl7`,
      sentAt: "2026-06-01T08:30:00.000Z",
      sendStatus: "sent",
      remotePath: `oru/${accessionNo}_PharmD_ORU.hl7`,
      receiptRemoteDir: "pharmd-pdf2",
      receiptIntervalSec: 1200,
      receiptMaxChecks: 5,
      receiptNextCheckAt: "2026-06-01T08:50:00.000Z",
    },
  });
  t.after(async () => {
    await harness.close();
  });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const summary = await harness.pollPharmdReceiptFolderOnce({
      store: harness.portalStore,
      mode: "auto",
      force: true,
    });
    assert.equal(summary.checkedOrders, 1);
    assert.equal(summary.matchedOrders, 0);
  }

  const exhaustedOrder = harness.portalStore.getOrderById("00001");
  assert.equal(exhaustedOrder?.pharmd?.receiptAutoCheckCount, 5);
  assert.equal(exhaustedOrder?.pharmd?.receiptPollingStatus, "exhausted");
  assert.equal(exhaustedOrder?.pharmd?.receiptLastCheckResult, "not_found");
  assert.equal(exhaustedOrder?.pharmd?.receiptNextCheckAt, "");

  const skippedSummary = await harness.pollPharmdReceiptFolderOnce({
    store: harness.portalStore,
    mode: "auto",
    force: true,
  });
  assert.equal(skippedSummary.checkedOrders, 0);

  sftpServer.remoteFiles.set(`pharmd-pdf2/${accessionNo}_Processed_Report.pdf`, {
    buffer: Buffer.from("%PDF-late-pharmd-report", "utf8"),
    mtime: Math.floor(Date.now() / 1000),
  });

  const manualSummary = await harness.triggerPharmdReceiptPoll({
    reason: "test-manual-after-exhausted",
    orderIds: ["00001"],
    mode: "manual",
    force: true,
  });
  assert.equal(manualSummary.checkedOrders, 1);
  assert.equal(manualSummary.matchedOrders, 1);

  const recoveredOrder = harness.portalStore.getOrderById("00001");
  assert.equal(recoveredOrder?.pharmd?.sendStatus, "received");
  assert.equal(recoveredOrder?.pharmd?.receiptPollingStatus, "matched");
  assert.equal(recoveredOrder?.pharmd?.receiptManualCheckCount, 1);
  assert.equal(recoveredOrder?.pharmd?.reportReceivedFileName, `${accessionNo}_Processed_Report.pdf`);
});
