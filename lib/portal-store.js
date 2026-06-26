const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const { normalizeIcdCodeList } = require("../assets/icd-code-utils");
const {
  buildAccessionCounterName,
  resolveAccessionTimeZone,
} = require("./accession-number");

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function toJson(value) {
  return JSON.stringify(value ?? null);
}

function createHash(parts) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function normalizeRegistration(record) {
  const createdAt = String(record?.createdAt || new Date().toISOString());
  const normalized = {
    ...record,
    patientId: String(record?.patientId || "").trim(),
    firstName: String(record?.firstName || "").trim(),
    lastName: String(record?.lastName || "").trim(),
    provider: String(record?.provider || "").trim(),
    facilityName: String(record?.facilityName || "").trim(),
    createdAt,
  };
  const recordKey = createHash([
    normalized.patientId,
    normalized.firstName,
    normalized.lastName,
    String(normalized?.dob || "").trim(),
    String(normalized?.phone || "").trim(),
    String(normalized?.mrn || "").trim(),
    createdAt,
  ]);
  return { recordKey, record: normalized };
}

function normalizeOrderServiceLine(line, index = 0) {
  const price = Number(line?.price || 0);
  const concession = Number(line?.concession || 0);
  const due = Number(line?.due ?? Math.max(price - concession, 0));
  return {
    ...line,
    lineNo: Math.max(1, Math.floor(Number(line?.lineNo || index + 1))),
    serviceName: String(line?.serviceName || "").trim(),
    panelIds: Array.isArray(line?.panelIds)
      ? line.panelIds.map((value) => String(value || "").trim()).filter(Boolean)
      : [],
    icdCodes: normalizeIcdCodeList(Array.isArray(line?.icdCodes) ? line.icdCodes : []),
    price: Number.isFinite(price) ? price : 0,
    concession: Number.isFinite(concession) ? concession : 0,
    due: Number.isFinite(due) ? due : 0,
  };
}

function normalizeOrder(record) {
  const createdAt = String(record?.createdAt || new Date().toISOString());
  const updatedAt = String(record?.updatedAt || new Date().toISOString());
  const orderId = String(record?.orderId || "").trim();
  if (!orderId) throw new Error("Order ID is required.");
  return {
    ...record,
    orderId,
    patientId: String(record?.patientId || "").trim(),
    patientName: String(record?.patientName || "").trim(),
    provider: String(record?.provider || "").trim(),
    facilityName: String(record?.facilityName || "").trim(),
    accessionNo: String(record?.accessionNo || "").trim(),
    status: String(record?.status || "").trim() || "Pending",
    services: Array.isArray(record?.services)
      ? record.services.map((line, index) => normalizeOrderServiceLine(line, index))
      : [],
    createdAt,
    updatedAt,
  };
}

function normalizeUploadLog(entry) {
  const uploadedAt = String(entry?.uploadedAt || new Date().toISOString());
  const normalized = {
    ...entry,
    fileName: String(entry?.fileName || "").trim(),
    uploadedAt,
    result: String(entry?.result || "").trim(),
    accessionNumbers: Array.isArray(entry?.accessionNumbers)
      ? entry.accessionNumbers.map((value) => String(value || "").trim()).filter(Boolean)
      : [],
    updatedOrderIds: Array.isArray(entry?.updatedOrderIds)
      ? entry.updatedOrderIds.map((value) => String(value || "").trim()).filter(Boolean)
      : [],
  };
  const logKey = createHash([
    normalized.fileName,
    uploadedAt,
    normalized.result,
    normalized.accessionNumbers.join(","),
    normalized.updatedOrderIds.join(","),
  ]);
  return { logKey, entry: normalized };
}

function normalizeOrderFile(file) {
  const createdAt = String(file?.createdAt || new Date().toISOString());
  const normalized = {
    ...file,
    orderId: String(file?.orderId || "").trim(),
    fileRole: String(file?.fileRole || "").trim(),
    reportType: String(file?.reportType || "").trim(),
    bucket: String(file?.bucket || "").trim(),
    key: String(file?.key || "").trim(),
    fileName: String(file?.fileName || "").trim(),
    mimeType: String(file?.mimeType || "").trim(),
    sizeBytes: Number(file?.sizeBytes || 0) || 0,
    createdAt,
    metadata: file?.metadata && typeof file.metadata === "object" ? file.metadata : {},
  };
  if (!normalized.fileRole) throw new Error("Order file role is required.");
  if (!normalized.key) throw new Error("Order file key is required.");
  const fileKey = createHash([
    normalized.orderId,
    normalized.fileRole,
    normalized.reportType,
    normalized.key,
  ]);
  return { fileKey, file: normalized };
}

function createPortalStore({ dataDir }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "labcenter.sqlite");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_key TEXT NOT NULL UNIQUE,
      patient_id TEXT,
      first_name TEXT,
      last_name TEXT,
      provider TEXT,
      facility_name TEXT,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL UNIQUE,
      patient_id TEXT,
      patient_name TEXT,
      provider TEXT,
      facility_name TEXT,
      accession_no TEXT,
      status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS upload_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_key TEXT NOT NULL UNIQUE,
      file_name TEXT,
      uploaded_at TEXT NOT NULL,
      result TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS counters (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_key TEXT NOT NULL UNIQUE,
      order_id TEXT,
      file_role TEXT NOT NULL,
      report_type TEXT,
      s3_bucket TEXT,
      s3_key TEXT NOT NULL,
      file_name TEXT,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_facility_provider ON orders(facility_name, provider);
    CREATE INDEX IF NOT EXISTS idx_upload_logs_uploaded_at ON upload_logs(uploaded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_order_files_order_id ON order_files(order_id, created_at DESC);
  `);

  const statements = {
    upsertRegistration: db.prepare(`
      INSERT INTO registrations (
        record_key,
        patient_id,
        first_name,
        last_name,
        provider,
        facility_name,
        created_at,
        payload_json
      ) VALUES (
        @recordKey,
        @patientId,
        @firstName,
        @lastName,
        @provider,
        @facilityName,
        @createdAt,
        @payloadJson
      )
      ON CONFLICT(record_key) DO UPDATE SET
        patient_id = excluded.patient_id,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        provider = excluded.provider,
        facility_name = excluded.facility_name,
        payload_json = excluded.payload_json
    `),
    listRegistrations: db.prepare(`
      SELECT payload_json
      FROM registrations
      ORDER BY datetime(created_at) DESC, id DESC
    `),
    listRegistrationsByPatientId: db.prepare(`
      SELECT record_key, payload_json
      FROM registrations
      WHERE patient_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
    `),
    deleteRegistrationByKey: db.prepare(`
      DELETE FROM registrations
      WHERE record_key = ?
    `),
    countRegistrations: db.prepare(`SELECT COUNT(*) AS count FROM registrations`),
    upsertOrder: db.prepare(`
      INSERT INTO orders (
        order_id,
        patient_id,
        patient_name,
        provider,
        facility_name,
        accession_no,
        status,
        created_at,
        updated_at,
        payload_json
      ) VALUES (
        @orderId,
        @patientId,
        @patientName,
        @provider,
        @facilityName,
        @accessionNo,
        @status,
        @createdAt,
        @updatedAt,
        @payloadJson
      )
      ON CONFLICT(order_id) DO UPDATE SET
        patient_id = excluded.patient_id,
        patient_name = excluded.patient_name,
        provider = excluded.provider,
        facility_name = excluded.facility_name,
        accession_no = excluded.accession_no,
        status = excluded.status,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        payload_json = excluded.payload_json
    `),
    listOrders: db.prepare(`
      SELECT payload_json
      FROM orders
      ORDER BY datetime(created_at) DESC, id DESC
    `),
    getOrderById: db.prepare(`
      SELECT payload_json
      FROM orders
      WHERE order_id = ?
      LIMIT 1
    `),
    getMaxNumericOrderId: db.prepare(`
      SELECT MAX(CAST(order_id AS INTEGER)) AS max_order_id
      FROM orders
      WHERE order_id <> ''
        AND order_id NOT GLOB '*[^0-9]*'
    `),
    upsertUploadLog: db.prepare(`
      INSERT INTO upload_logs (
        log_key,
        file_name,
        uploaded_at,
        result,
        payload_json
      ) VALUES (
        @logKey,
        @fileName,
        @uploadedAt,
        @result,
        @payloadJson
      )
      ON CONFLICT(log_key) DO UPDATE SET
        file_name = excluded.file_name,
        uploaded_at = excluded.uploaded_at,
        result = excluded.result,
        payload_json = excluded.payload_json
    `),
    getCounter: db.prepare(`
      SELECT value
      FROM counters
      WHERE name = ?
      LIMIT 1
    `),
    upsertCounter: db.prepare(`
      INSERT INTO counters (
        name,
        value
      ) VALUES (
        @name,
        @value
      )
      ON CONFLICT(name) DO UPDATE SET
        value = excluded.value
    `),
    listUploadLogs: db.prepare(`
      SELECT payload_json
      FROM upload_logs
      ORDER BY datetime(uploaded_at) DESC, id DESC
      LIMIT 500
    `),
    upsertOrderFile: db.prepare(`
      INSERT INTO order_files (
        file_key,
        order_id,
        file_role,
        report_type,
        s3_bucket,
        s3_key,
        file_name,
        mime_type,
        size_bytes,
        created_at,
        metadata_json
      ) VALUES (
        @fileKey,
        @orderId,
        @fileRole,
        @reportType,
        @bucket,
        @key,
        @fileName,
        @mimeType,
        @sizeBytes,
        @createdAt,
        @metadataJson
      )
      ON CONFLICT(file_key) DO UPDATE SET
        order_id = excluded.order_id,
        report_type = excluded.report_type,
        s3_bucket = excluded.s3_bucket,
        s3_key = excluded.s3_key,
        file_name = excluded.file_name,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        created_at = excluded.created_at,
        metadata_json = excluded.metadata_json
    `),
  };

  const upsertRegistrationTxn = db.transaction((record) => {
    const normalized = normalizeRegistration(record);
    statements.upsertRegistration.run({
      recordKey: normalized.recordKey,
      patientId: normalized.record.patientId,
      firstName: normalized.record.firstName,
      lastName: normalized.record.lastName,
      provider: normalized.record.provider,
      facilityName: normalized.record.facilityName,
      createdAt: normalized.record.createdAt,
      payloadJson: toJson(normalized.record),
    });
    return normalized.record;
  });

  const replaceRegistrationsTxn = db.transaction((entries) => {
    return entries.map((entry) => {
      const recordKey = String(entry?.recordKey || "").trim();
      if (!recordKey) {
        throw new Error("Registration record key is required.");
      }
      statements.deleteRegistrationByKey.run(recordKey);
      const normalized = normalizeRegistration(entry?.record || {});
      statements.upsertRegistration.run({
        recordKey: normalized.recordKey,
        patientId: normalized.record.patientId,
        firstName: normalized.record.firstName,
        lastName: normalized.record.lastName,
        provider: normalized.record.provider,
        facilityName: normalized.record.facilityName,
        createdAt: normalized.record.createdAt,
        payloadJson: toJson(normalized.record),
      });
      return normalized.record;
    });
  });

  const upsertOrdersTxn = db.transaction((records) => {
    return records.map((record) => {
      const normalized = normalizeOrder(record);
      statements.upsertOrder.run({
        orderId: normalized.orderId,
        patientId: normalized.patientId,
        patientName: normalized.patientName,
        provider: normalized.provider,
        facilityName: normalized.facilityName,
        accessionNo: normalized.accessionNo,
        status: normalized.status,
        createdAt: normalized.createdAt,
        updatedAt: normalized.updatedAt,
        payloadJson: toJson(normalized),
      });
      return normalized;
    });
  });

  const appendUploadLogsTxn = db.transaction((entries) => {
    return entries.map((entry) => {
      const normalized = normalizeUploadLog(entry);
      statements.upsertUploadLog.run({
        logKey: normalized.logKey,
        fileName: normalized.entry.fileName,
        uploadedAt: normalized.entry.uploadedAt,
        result: normalized.entry.result,
        payloadJson: toJson(normalized.entry),
      });
      return normalized.entry;
    });
  });

  const reserveOrderIdsTxn = db.transaction((options = {}) => {
    const count = Math.max(1, Math.floor(Number(options?.count || 1)));
    const startAt = Math.max(0, Math.floor(Number(options?.startAt || 1)));
    const padLength = Math.max(1, Math.floor(Number(options?.padLength || 5)));
    const counterName = "order_id";
    const maxExisting = Number(statements.getMaxNumericOrderId.get()?.max_order_id || 0);
    const nextStoredValue = Number(statements.getCounter.get(counterName)?.value || 0);
    const nextValue = Math.max(startAt, maxExisting + 1, nextStoredValue || 0);
    const reserved = Array.from({ length: count }, (_, index) => String(nextValue + index).padStart(padLength, "0"));
    statements.upsertCounter.run({
      name: counterName,
      value: nextValue + count,
    });
    return reserved;
  });

  const reserveAccessionSequencesTxn = db.transaction((entries, options = {}) => {
    const requests = Array.isArray(entries) ? entries : [];
    const timeZone = resolveAccessionTimeZone(options?.timeZone);
    const nextValueByCounter = new Map();
    const assignments = requests.map((entry) => {
      const createdAt = String(entry?.createdAt || new Date().toISOString());
      const counterName = buildAccessionCounterName(createdAt, { timeZone });
      let nextValue = 1;
      if (nextValueByCounter.has(counterName)) {
        nextValue = nextValueByCounter.get(counterName);
      } else {
        const storedValue = Number(statements.getCounter.get(counterName)?.value || 1);
        nextValue = Math.max(1, Math.floor(storedValue || 1));
      }
      nextValueByCounter.set(counterName, nextValue + 1);
      return {
        counterName,
        createdAt,
        sequence: nextValue,
      };
    });

    nextValueByCounter.forEach((nextValue, counterName) => {
      statements.upsertCounter.run({
        name: counterName,
        value: nextValue,
      });
    });

    return assignments;
  });

  const importLocalDataTxn = db.transaction((payload) => {
    const registrations = Array.isArray(payload?.registrations) ? payload.registrations : [];
    const orders = Array.isArray(payload?.orders) ? payload.orders : [];
    const uploadResultsLog = Array.isArray(payload?.uploadResultsLog) ? payload.uploadResultsLog : [];

    registrations.forEach((record) => upsertRegistrationTxn(record));
    upsertOrdersTxn(orders);
    appendUploadLogsTxn(uploadResultsLog);

    return {
      registrations: registrations.length,
      orders: orders.length,
      uploadResultsLog: uploadResultsLog.length,
    };
  });

  return {
    dbPath,
    listRegistrations() {
      return statements.listRegistrations.all().map((row) => safeJsonParse(row.payload_json, {})).filter(Boolean);
    },
    listRegistrationsByPatientId(patientId) {
      return statements.listRegistrationsByPatientId
        .all(String(patientId || "").trim())
        .map((row) => ({
          recordKey: String(row?.record_key || "").trim(),
          record: safeJsonParse(row.payload_json, {}),
        }))
        .filter((entry) => entry.recordKey);
    },
    countRegistrations() {
      return Number(statements.countRegistrations.get()?.count || 0);
    },
    upsertRegistration(record) {
      return upsertRegistrationTxn(record);
    },
    replaceRegistrations(entries) {
      return replaceRegistrationsTxn(Array.isArray(entries) ? entries : []);
    },
    upsertOrders(records) {
      return upsertOrdersTxn(Array.isArray(records) ? records : []);
    },
    listOrders() {
      return statements.listOrders.all().map((row) => safeJsonParse(row.payload_json, {})).filter(Boolean);
    },
    getOrderById(orderId) {
      const row = statements.getOrderById.get(String(orderId || "").trim());
      return row ? safeJsonParse(row.payload_json, null) : null;
    },
    reserveOrderIds(options) {
      return reserveOrderIdsTxn(options);
    },
    reserveAccessionSequences(entries, options) {
      return reserveAccessionSequencesTxn(entries, options);
    },
    appendUploadLogs(entries) {
      return appendUploadLogsTxn(Array.isArray(entries) ? entries : []);
    },
    listUploadLogs() {
      return statements.listUploadLogs.all().map((row) => safeJsonParse(row.payload_json, {})).filter(Boolean);
    },
    saveOrderFile(file) {
      const normalized = normalizeOrderFile(file);
      statements.upsertOrderFile.run({
        fileKey: normalized.fileKey,
        orderId: normalized.file.orderId,
        fileRole: normalized.file.fileRole,
        reportType: normalized.file.reportType,
        bucket: normalized.file.bucket,
        key: normalized.file.key,
        fileName: normalized.file.fileName,
        mimeType: normalized.file.mimeType,
        sizeBytes: normalized.file.sizeBytes,
        createdAt: normalized.file.createdAt,
        metadataJson: toJson(normalized.file.metadata),
      });
      return normalized.file;
    },
    importLocalData(payload) {
      return importLocalDataTxn(payload || {});
    },
  };
}

module.exports = {
  createPortalStore,
};
