const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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

async function startTestSftpServer({
  username = "jays-user",
  password = "top-secret",
  remoteDir = "oru",
} = {}) {
  const remoteRoot = normalizeRemotePath(remoteDir);
  const uploadedFiles = new Map();
  const { private: privateKey } = generateKeyPairSync("ed25519");
  let nextHandleId = 1;

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
            if (normalizeRemotePath(dirPath) !== remoteRoot) {
              sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
              return;
            }
            sftp.handle(reqid, makeHandle({ type: "dir" }));
          }).on("READDIR", (reqid, handle) => {
            if (!readHandle(handle)) {
              sftp.status(reqid, STATUS_CODE.FAILURE);
              return;
            }
            sftp.status(reqid, STATUS_CODE.EOF);
          }).on("OPEN", (reqid, filename, flags) => {
            const normalized = normalizeRemotePath(filename);
            if (!(flags & OPEN_MODE.WRITE) || path.posix.dirname(normalized) !== remoteRoot) {
              sftp.status(reqid, STATUS_CODE.FAILURE);
              return;
            }
            sftp.handle(reqid, makeHandle({
              type: "file",
              remotePath: normalized,
              chunks: [],
            }));
          }).on("WRITE", (reqid, handle, offset, data) => {
            const entry = readHandle(handle);
            if (!entry || entry.type !== "file") {
              sftp.status(reqid, STATUS_CODE.FAILURE);
              return;
            }
            entry.chunks.push({
              offset: Number(offset || 0),
              data: Buffer.from(data),
            });
            sftp.status(reqid, STATUS_CODE.OK);
          }).on("CLOSE", (reqid, handle) => {
            const key = handle.readUInt32BE(0);
            const entry = openHandles.get(key);
            if (!entry) {
              sftp.status(reqid, STATUS_CODE.FAILURE);
              return;
            }
            if (entry.type === "file") {
              uploadedFiles.set(entry.remotePath, assembleChunks(entry.chunks));
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
            if (normalized === remoteRoot) {
              sftp.attrs(reqid, { mode: 0o040755 });
              return;
            }
            const buffer = uploadedFiles.get(normalized);
            if (buffer) {
              sftp.attrs(reqid, { mode: 0o100644, size: buffer.length });
              return;
            }
            sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
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
    PHARMD_SFTP_TIMEOUT_SEC: process.env.PHARMD_SFTP_TIMEOUT_SEC,
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
  const { startServer, portalStore } = require("../server.js");

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
    portalStore,
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
