const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { mergePdfBuffers } = require("../../lib/pdf-merge");

function sanitizeReportPdfFileName(value) {
  const raw = String(value || "").trim();
  const cleaned = raw
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  if (!cleaned) return `Final_Report_${Date.now()}.pdf`;
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

function sanitizeStoredFileName(value, fallbackBase = "document", fallbackExt = ".bin") {
  const raw = String(value || "").trim();
  const rawExt = path.extname(raw).toLowerCase();
  const rawBase = path.basename(raw, rawExt);
  const cleanedBase = rawBase
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  const cleanedExt = rawExt
    .replace(/[^a-z0-9.]+/g, "")
    .slice(0, 16);
  if (!cleanedBase) {
    return `${fallbackBase}_${Date.now()}${cleanedExt || fallbackExt}`;
  }
  return `${cleanedBase}${cleanedExt || fallbackExt}`;
}

function createStatusError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isLikelyEmailAddress(value) {
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(String(value || "").trim());
}

function resolvePublishFaxSenderEmail(req, senderEmailOverride) {
  const candidates = [
    senderEmailOverride,
    req?.session?.user?.email,
    req?.session?.clientUser?.email,
    "innovexlab@innovexlab.com",
  ];
  return candidates
    .map((value) => String(value || "").trim().toLowerCase())
    .find((value) => isLikelyEmailAddress(value))
    || "";
}

function formatFaxDisplayNumber(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;
  if (normalized.length === 10) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  }
  return String(value || "").trim();
}

function createPublishFaxRecord(existingRecord, patch = {}, {
  senderFaxNumber = "",
  recipientFaxNumber = "",
} = {}) {
  const currentRecord = existingRecord && typeof existingRecord === "object" ? existingRecord : {};
  return {
    ...currentRecord,
    ...patch,
    senderFaxNumber,
    recipientFaxNumber,
    deliveryVendor: "SRFax",
    channel: "fax",
  };
}

function resolveOrderFaxRecipient(order, dependencies) {
  const recipientFaxDigits = String(typeof dependencies.resolveFacilityFaxForOrderPublish === "function"
    ? dependencies.resolveFacilityFaxForOrderPublish(order)
    : "").trim();
  return {
    recipientFaxDigits,
    recipientFaxNumber: formatFaxDisplayNumber(recipientFaxDigits),
    recipientAvailable: Boolean(recipientFaxDigits),
  };
}

function buildCombinedPharmdFileName(orderId) {
  return sanitizeReportPdfFileName(`Order_${String(orderId || "").trim() || "Combined"}_Final_PharmD_Combined.pdf`);
}

async function buildCombinedPharmdPdf(orderId, existingOrder, dependencies) {
  const generatedFinal = existingOrder?.generatedReports?.final;
  const receivedReport = existingOrder?.pharmd?.receivedReport;
  if (!generatedFinal?.bucket || !generatedFinal?.key) {
    throw createStatusError("Saved final report PDF not found for this order.", 404);
  }
  if (!receivedReport?.bucket || !receivedReport?.key) {
    throw createStatusError("PharmD return file not found for this order.", 404);
  }

  const finalReport = await loadStoredPortalFileBuffer(generatedFinal, dependencies, {
    notFoundMessage: "Saved final report PDF not found for this order.",
    loadFailedMessage: "Saved final report PDF could not be loaded.",
    serviceUnavailableMessage: "S3 report storage is not configured for this environment.",
  });
  const pharmdReport = await loadStoredPortalFileBuffer(receivedReport, dependencies, {
    notFoundMessage: "PharmD return file not found for this order.",
    loadFailedMessage: "PharmD return file could not be loaded.",
    serviceUnavailableMessage: "S3 file storage is not configured for this environment.",
  });
  const combinedBuffer = await mergePdfBuffers([
    { buffer: pharmdReport.buffer, label: "PharmD return PDF" },
    { buffer: finalReport.buffer, label: "saved final report PDF" },
  ], {
    normalizePageSize: "last-source",
  });

  return {
    combinedBuffer,
    fileName: buildCombinedPharmdFileName(orderId),
    finalReport,
    pharmdReport,
  };
}

function normalizeSrfaxRecipientFaxDigits(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  const normalized = digits.length === 10 ? `1${digits}` : digits;
  if (!/^1\d{10}$/.test(normalized)) {
    throw new Error("Facility fax number must contain a valid 10-digit U.S. or Canadian number.");
  }
  return normalized;
}

async function buildPublishFaxPdf(orderId, existingOrder, dependencies) {
  if (!existingOrder?.pharmd?.skipPharmd) {
    const combined = await buildCombinedPharmdPdf(orderId, existingOrder, dependencies);
    return {
      pdfBuffer: combined.combinedBuffer,
      fileName: combined.fileName,
      finalReport: combined.finalReport,
      pharmdReport: combined.pharmdReport,
      reportType: "combined",
    };
  }

  const generatedFinal = existingOrder?.generatedReports?.final;
  const finalReport = await loadStoredPortalFileBuffer(generatedFinal, dependencies, {
    notFoundMessage: "Saved final report PDF not found for this order.",
    loadFailedMessage: "Saved final report PDF could not be loaded.",
    serviceUnavailableMessage: "S3 report storage is not configured for this environment.",
  });
  return {
    pdfBuffer: finalReport.buffer,
    fileName: sanitizeReportPdfFileName(generatedFinal?.fileName || `Order_${orderId}_Final_Report.pdf`),
    finalReport,
    pharmdReport: null,
    reportType: "final",
  };
}

async function persistRenderedReportBuffer(req, existingOrder, pdfBuffer, { orderId, fileName, reportType, sourceHash = "" }, dependencies) {
  const {
    shouldUseS3ForRequest,
    s3Storage,
    buildStoredFileKey,
    portalStore,
    buildLocalReportStorageKey,
    resolveLocalReportStoragePath,
    ensureDir,
  } = dependencies;

  const generatedAt = new Date().toISOString();
  if (shouldUseS3ForRequest(req)) {
    const storedReport = await s3Storage.uploadBuffer({
      key: buildStoredFileKey("reports", reportType, orderId || "unassigned", `${generatedAt}-${fileName}`),
      body: pdfBuffer,
      contentType: "application/pdf",
      metadata: {
        orderid: orderId,
        reporttype: reportType,
        filename: fileName,
      },
      contentDisposition: `inline; filename="${fileName}"`,
      cacheControl: "private, max-age=0, no-store",
    });
    portalStore.saveOrderFile({
      orderId,
      fileRole: "report_pdf",
      reportType,
      bucket: storedReport.bucket,
      key: storedReport.key,
      fileName,
      mimeType: "application/pdf",
      sizeBytes: storedReport.sizeBytes,
      createdAt: generatedAt,
      metadata: {
        generatedAt,
        sourceHash,
      },
    });
    if (existingOrder) {
      portalStore.upsertOrders([
        {
          ...existingOrder,
          generatedReports: {
            ...(existingOrder.generatedReports || {}),
            [reportType]: {
              bucket: storedReport.bucket,
              key: storedReport.key,
              fileName,
              mimeType: "application/pdf",
              sizeBytes: storedReport.sizeBytes,
              generatedAt,
              sourceHash,
            },
          },
          updatedAt: generatedAt,
        },
      ]);
    }
  } else {
    const localStorageKey = buildLocalReportStorageKey({
      reportType,
      orderId,
      fileName,
      generatedAt,
    });
    const localStoragePath = resolveLocalReportStoragePath(localStorageKey);
    if (!localStoragePath) {
      throw new Error("Unable to resolve local report storage path.");
    }
    ensureDir(path.dirname(localStoragePath));
    fs.writeFileSync(localStoragePath, pdfBuffer);
    portalStore.saveOrderFile({
      orderId,
      fileRole: "report_pdf",
      reportType,
      bucket: "local",
      key: localStorageKey,
      fileName,
      mimeType: "application/pdf",
      sizeBytes: pdfBuffer.length,
      createdAt: generatedAt,
      metadata: {
        generatedAt,
        storageType: "local",
        sourceHash,
      },
    });
    if (existingOrder) {
      portalStore.upsertOrders([
        {
          ...existingOrder,
          generatedReports: {
            ...(existingOrder.generatedReports || {}),
            [reportType]: {
              bucket: "local",
              key: localStorageKey,
              storageType: "local",
              fileName,
              mimeType: "application/pdf",
              sizeBytes: pdfBuffer.length,
              generatedAt,
              sourceHash,
            },
          },
          updatedAt: generatedAt,
        },
      ]);
    }
  }
  return generatedAt;
}

async function loadStoredPortalFileBuffer(storedFile, dependencies, messages = {}) {
  const {
    resolveLocalReportStoragePath,
    isLocalGeneratedReportRecord,
    s3Storage,
  } = dependencies;
  const {
    notFoundMessage = "Stored file not found.",
    loadFailedMessage = "Stored file could not be loaded.",
    serviceUnavailableMessage = "S3 file storage is not configured for this environment.",
  } = messages;

  const bucket = String(storedFile?.bucket || "").trim();
  const key = String(storedFile?.key || "").trim();
  if (!bucket || !key) {
    throw createStatusError(notFoundMessage, 404);
  }

  if (isLocalGeneratedReportRecord(storedFile)) {
    const localReportPath = resolveLocalReportStoragePath(key);
    if (!localReportPath || !fs.existsSync(localReportPath)) {
      throw createStatusError(loadFailedMessage, 404);
    }
    const storedReport = fs.readFileSync(localReportPath);
    if (!storedReport?.length) {
      throw createStatusError(loadFailedMessage, 404);
    }
    return {
      buffer: storedReport,
      bucket,
      key,
      contentType: storedFile?.mimeType || "application/octet-stream",
      contentDisposition: storedFile?.fileName ? `inline; filename="${sanitizeStoredFileName(storedFile.fileName)}"` : "",
      contentLength: storedReport.length,
      storageType: "local",
    };
  }

  if (!s3Storage.enabled) {
    throw createStatusError(serviceUnavailableMessage, 503);
  }

  const storedReport = await s3Storage.downloadBuffer({ bucket, key });
  if (!storedReport?.body?.length) {
    throw createStatusError(loadFailedMessage, 404);
  }

  return {
    buffer: storedReport.body,
    bucket,
    key,
    contentType: storedReport.contentType || storedFile?.mimeType || "application/octet-stream",
    contentDisposition: storedReport.contentDisposition || "",
    contentLength: storedReport.contentLength || storedReport.body.length,
    storageType: "s3",
  };
}

function renderReportPdfFromHtml(htmlMarkup, dependencies) {
  const { reportPdfEnabled, reportPdfRendererPath } = dependencies;

  return new Promise((resolve, reject) => {
    if (!reportPdfEnabled) {
      reject(new Error("Report PDF rendering is disabled on this deployment."));
      return;
    }
    let tempDir = "";
    try {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "labcenter-report-"));
    } catch {
      reject(new Error("Unable to create temporary workspace for report generation."));
      return;
    }

    const htmlPath = path.join(tempDir, "report.html");
    const pdfPath = path.join(tempDir, "report.pdf");
    const cleanup = () => {
      if (!tempDir) return;
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Cleanup best effort only.
      }
      tempDir = "";
    };

    const finish = (error, pdfBuffer = null) => {
      cleanup();
      if (error) reject(error);
      else resolve(pdfBuffer);
    };

    try {
      fs.writeFileSync(htmlPath, htmlMarkup, "utf8");
    } catch {
      finish(new Error("Unable to write temporary report template."));
      return;
    }

    const runProcessRenderer = (command, args, timeoutMs = 45000) =>
      new Promise((resolveRenderer, rejectRenderer) => {
        const child = spawn(command, args, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        let settled = false;

        const done = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) rejectRenderer(error);
          else resolveRenderer();
        };

        const timer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // No-op.
          }
          done(new Error("Report PDF generation timed out."));
        }, timeoutMs);

        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString("utf8");
        });

        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString("utf8");
        });

        child.on("error", (error) => {
          done(new Error(`Unable to launch PDF renderer: ${error.message}`));
        });

        child.on("close", (code) => {
          if (code !== 0) {
            const details = (stderr || stdout || "").trim();
            done(new Error(details || `PDF renderer failed with exit code ${code}.`));
            return;
          }
          done(null);
        });
      });

    const resolveHeadlessBrowserPath = () => {
      const envPath = String(process.env.LABCENTER_PDF_BROWSER || "").trim();
      const commandExists = (command) => {
        if (!command) return false;
        const lookupCommand = process.platform === "win32" ? "where" : "which";
        try {
          const result = spawnSync(lookupCommand, [command], { stdio: "ignore" });
          return result.status === 0;
        } catch {
          return false;
        }
      };
      if (envPath) {
        if ((envPath.includes(path.sep) || process.platform === "win32") && fs.existsSync(envPath)) return envPath;
        if (commandExists(envPath)) return envPath;
      }

      const candidates = process.platform === "win32"
        ? [
            "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
            "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          ]
        : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          ]
        : ["microsoft-edge", "google-chrome", "chromium", "chromium-browser"];

      for (const candidate of candidates) {
        if (candidate.includes(path.sep)) {
          if (fs.existsSync(candidate)) return candidate;
        } else if (commandExists(candidate)) {
          return candidate;
        }
      }
      return "";
    };

    const runSwiftRenderer = async () => {
      if (!fs.existsSync(reportPdfRendererPath)) {
        throw new Error("Swift PDF renderer script is unavailable.");
      }
      await runProcessRenderer("swift", [reportPdfRendererPath, htmlPath, pdfPath]);
    };

    const runHeadlessBrowserRenderer = async () => {
      const browserBinary = resolveHeadlessBrowserPath();
      if (!browserBinary) {
        throw new Error("No compatible headless browser was found for PDF rendering.");
      }
      const htmlUrl = pathToFileURL(htmlPath).toString();
      const args = [
        "--headless=new",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--allow-file-access-from-files",
        `--print-to-pdf=${pdfPath}`,
        htmlUrl,
      ];
      await runProcessRenderer(browserBinary, args);
    };

    const attempts = process.platform === "darwin"
      ? [
          { name: "swift", run: runSwiftRenderer },
          { name: "headless-browser", run: runHeadlessBrowserRenderer },
        ]
      : [
          { name: "headless-browser", run: runHeadlessBrowserRenderer },
          { name: "swift", run: runSwiftRenderer },
        ];

    (async () => {
      const errors = [];
      for (const attempt of attempts) {
        try {
          await attempt.run();
          const pdfBuffer = fs.readFileSync(pdfPath);
          if (!pdfBuffer?.length) throw new Error("Renderer completed but produced an empty file.");
          finish(null, pdfBuffer);
          return;
        } catch (error) {
          errors.push(`${attempt.name}: ${error?.message || "render failed"}`);
        }
      }
      finish(new Error(errors.join(" | ") || "Unable to generate report PDF."));
    })();
  });
}

async function queueSrfaxFax({
  orderId,
  fileName,
  pdfBuffer,
  senderEmail,
  recipientFaxDigits,
  recipientFaxNumber,
  srfaxConfig,
}) {
  if (!srfaxConfig.accessId || !srfaxConfig.accessPwd) {
    throw new Error("SRFax credentials are not configured.");
  }
  if (!isLikelyEmailAddress(senderEmail)) {
    throw new Error("SRFax sender email is not configured.");
  }
  if (!pdfBuffer?.length) {
    throw new Error("Saved final report PDF could not be loaded.");
  }
  if (!String(recipientFaxDigits || "").trim()) {
    throw new Error("Facility fax number is not configured for this order.");
  }

  const srfaxRecipientFaxDigits = normalizeSrfaxRecipientFaxDigits(recipientFaxDigits);

  const payload = new URLSearchParams({
    action: "Queue_Fax",
    access_id: srfaxConfig.accessId,
    access_pwd: srfaxConfig.accessPwd,
    sCallerID: srfaxConfig.senderFaxDigits,
    sSenderEmail: senderEmail,
    sFaxType: "SINGLE",
    sToFaxNumber: srfaxRecipientFaxDigits,
    sResponseFormat: "JSON",
    sAccountCode: String(orderId || "").trim().slice(0, 20),
    sCPSubject: `Final Report Order ${String(orderId || "").trim()}`.slice(0, 80),
    sFaxFromHeader: "LabCenter",
    sFileName_1: sanitizeReportPdfFileName(fileName || `Order_${orderId}_Final_Report.pdf`),
    sFileContent_1: pdfBuffer.toString("base64"),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), srfaxConfig.timeoutMs);

  try {
    const response = await fetch(srfaxConfig.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: payload.toString(),
      signal: controller.signal,
    });

    const raw = await response.text();
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error("SRFax returned an unexpected response.");
    }

    if (!response.ok) {
      throw new Error(String(parsed?.Result || parsed?.error || response.statusText || "SRFax request failed.").trim() || "SRFax request failed.");
    }

    const status = String(parsed?.Status || "").trim().toLowerCase();
    const result = parsed?.Result;
    if (status !== "success") {
      throw new Error(String(result || "SRFax rejected the fax request.").trim() || "SRFax rejected the fax request.");
    }

    return {
      status: "queued",
      faxDetailsId: String(result || "").trim(),
      result,
      message: `Fax queued successfully for ${recipientFaxNumber || formatFaxDisplayNumber(recipientFaxDigits)}.`,
      mode: "live",
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("SRFax request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function registerReportPublishingRoutes({ app, dependencies }) {
  const {
    requireAuthenticatedUser,
    hasReportPdfAccess,
    portalStore,
    canAccessOrderRecord,
    auditLog,
    isLocalGeneratedReportRecord,
    publishFaxMode,
    srfaxConfig,
  } = dependencies;
  const activeReportRenderJobs = new Map();

  app.get("/api/orders/:orderId/generated-report-pdf/:reportType", requireAuthenticatedUser, async (req, res) => {
    try {
      const orderId = String(req.params.orderId || "").trim();
      const reportType = String(req.params.reportType || "").trim().toLowerCase();
      if (!orderId) {
        return res.status(400).json({ error: "Order ID is required." });
      }
      if (!["report", "summary"].includes(reportType)) {
        return res.status(400).json({ error: "Unsupported generated report type." });
      }

      const existingOrder = portalStore.getOrderById(orderId);
      if (!existingOrder || !canAccessOrderRecord(req, existingOrder)) {
        return res.status(404).json({ error: "Order not found." });
      }

      const generatedReport = existingOrder?.generatedReports?.[reportType];
      const defaultLabel = reportType === "summary" ? "Summary_Report" : "Report";
      const fileName = sanitizeReportPdfFileName(
        generatedReport?.fileName || `Order_${orderId}_${defaultLabel}.pdf`
      );
      const storedReport = await loadStoredPortalFileBuffer(generatedReport, dependencies, {
        notFoundMessage: "Saved generated report PDF not found for this order.",
        loadFailedMessage: "Saved generated report PDF could not be loaded.",
        serviceUnavailableMessage: "S3 report storage is not configured for this environment.",
      });

      auditLog(req, "view_saved_generated_report_pdf", "success", {
        orderId,
        reportType,
        bucket: storedReport.bucket,
        key: storedReport.key,
        storageType: storedReport.storageType,
        bytes: storedReport.buffer.length,
      });

      res.setHeader("Content-Type", storedReport.contentType || "application/pdf");
      res.setHeader("Content-Disposition", storedReport.contentDisposition || `inline; filename="${fileName}"`);
      res.setHeader("Cache-Control", "private, max-age=0, no-store");
      if (storedReport.contentLength) {
        res.setHeader("Content-Length", String(storedReport.contentLength));
      }
      return res.send(storedReport.buffer);
    } catch (error) {
      auditLog(req, "view_saved_generated_report_pdf", "failed", {
        orderId: String(req.params.orderId || ""),
        reportType: String(req.params.reportType || ""),
        reason: error?.message || "unexpected_error",
      });
      return res.status(Number(error?.statusCode) || 500).json({
        error: error?.message || "Unable to load saved generated report PDF.",
      });
    }
  });

  app.get("/api/orders/:orderId/final-report-pdf", requireAuthenticatedUser, async (req, res) => {
    try {
      const orderId = String(req.params.orderId || "").trim();
      if (!orderId) {
        return res.status(400).json({ error: "Order ID is required." });
      }

      const existingOrder = portalStore.getOrderById(orderId);
      if (!existingOrder || !canAccessOrderRecord(req, existingOrder)) {
        return res.status(404).json({ error: "Order not found." });
      }

      const generatedFinal = existingOrder?.generatedReports?.final;
      const fileName = sanitizeReportPdfFileName(
        generatedFinal?.fileName || `Order_${orderId}_Final_Report.pdf`
      );
      const storedReport = await loadStoredPortalFileBuffer(generatedFinal, dependencies, {
        notFoundMessage: "Saved final report PDF not found for this order.",
        loadFailedMessage: "Saved final report PDF could not be loaded.",
        serviceUnavailableMessage: "S3 report storage is not configured for this environment.",
      });

      auditLog(req, "view_saved_final_report_pdf", "success", {
        orderId,
        bucket: storedReport.bucket,
        key: storedReport.key,
        storageType: storedReport.storageType,
        bytes: storedReport.buffer.length,
      });

      res.setHeader("Content-Type", storedReport.contentType || "application/pdf");
      res.setHeader("Content-Disposition", storedReport.contentDisposition || `inline; filename="${fileName}"`);
      res.setHeader("Cache-Control", "private, max-age=0, no-store");
      if (storedReport.contentLength) {
        res.setHeader("Content-Length", String(storedReport.contentLength));
      }
      return res.send(storedReport.buffer);
    } catch (error) {
      auditLog(req, "view_saved_final_report_pdf", "failed", {
        orderId: String(req.params.orderId || ""),
        reason: error?.message || "unexpected_error",
      });
      return res.status(Number(error?.statusCode) || 500).json({
        error: error?.message || "Unable to load saved final report PDF.",
      });
    }
  });

  app.get("/api/pharmd/orders/:orderId/receipt-file", requireAuthenticatedUser, async (req, res) => {
    try {
      const orderId = String(req.params.orderId || "").trim();
      if (!orderId) {
        return res.status(400).json({ error: "Order ID is required." });
      }

      const existingOrder = portalStore.getOrderById(orderId);
      if (!existingOrder || !canAccessOrderRecord(req, existingOrder)) {
        return res.status(404).json({ error: "Order not found." });
      }

      const receivedReport = existingOrder?.pharmd?.receivedReport;
      const fileName = sanitizeStoredFileName(
        receivedReport?.fileName || existingOrder?.pharmd?.reportReceivedFileName || `Order_${orderId}_PharmD_Receipt.pdf`,
        "pharmd_receipt",
        ".pdf"
      );
      const storedFile = await loadStoredPortalFileBuffer(receivedReport, dependencies, {
        notFoundMessage: "PharmD return file not found for this order.",
        loadFailedMessage: "PharmD return file could not be loaded.",
        serviceUnavailableMessage: "S3 file storage is not configured for this environment.",
      });

      auditLog(req, "view_pharmd_receipt_file", "success", {
        orderId,
        bucket: storedFile.bucket,
        key: storedFile.key,
        storageType: storedFile.storageType,
        bytes: storedFile.buffer.length,
      });

      res.setHeader("Content-Type", storedFile.contentType || "application/pdf");
      res.setHeader("Content-Disposition", storedFile.contentDisposition || `inline; filename="${fileName}"`);
      res.setHeader("Cache-Control", "private, max-age=0, no-store");
      if (storedFile.contentLength) {
        res.setHeader("Content-Length", String(storedFile.contentLength));
      }
      return res.send(storedFile.buffer);
    } catch (error) {
      auditLog(req, "view_pharmd_receipt_file", "failed", {
        orderId: String(req.params.orderId || ""),
        reason: error?.message || "unexpected_error",
      });
      return res.status(Number(error?.statusCode) || 500).json({
        error: error?.message || "Unable to load PharmD return file.",
      });
    }
  });

  app.get("/api/pharmd/orders/:orderId/combined-report-pdf", requireAuthenticatedUser, async (req, res) => {
    try {
      const orderId = String(req.params.orderId || "").trim();
      if (!orderId) {
        return res.status(400).json({ error: "Order ID is required." });
      }

      const existingOrder = portalStore.getOrderById(orderId);
      if (!existingOrder || !canAccessOrderRecord(req, existingOrder)) {
        return res.status(404).json({ error: "Order not found." });
      }

      const {
        combinedBuffer,
        fileName,
        finalReport,
        pharmdReport,
      } = await buildCombinedPharmdPdf(orderId, existingOrder, dependencies);

      auditLog(req, "view_pharmd_combined_report_pdf", "success", {
        orderId,
        finalBucket: finalReport.bucket,
        finalKey: finalReport.key,
        pharmdBucket: pharmdReport.bucket,
        pharmdKey: pharmdReport.key,
        bytes: combinedBuffer.length,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.setHeader("Cache-Control", "private, max-age=0, no-store");
      res.setHeader("Content-Length", String(combinedBuffer.length));
      return res.send(combinedBuffer);
    } catch (error) {
      auditLog(req, "view_pharmd_combined_report_pdf", "failed", {
        orderId: String(req.params.orderId || ""),
        reason: error?.message || "unexpected_error",
      });
      return res.status(Number(error?.statusCode) || 500).json({
        error: error?.message || "Unable to build the combined PharmD PDF.",
      });
    }
  });

  app.post("/api/orders/render-report-pdf", async (req, res) => {
    if (!hasReportPdfAccess(req)) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const html = String(req.body?.html || "");
    if (!html.trim()) {
      return res.status(400).json({ error: "Report HTML content is required." });
    }
    if (html.length > 4 * 1024 * 1024) {
      return res.status(413).json({ error: "Report HTML content is too large." });
    }

    const fileName = sanitizeReportPdfFileName(req.body?.fileName || "");
    const orderId = String(req.body?.orderId || "").trim();
    const reportType = String(req.body?.reportType || "final").trim() || "final";
    const responseMode = String(req.body?.responseMode || "pdf").trim().toLowerCase();
    const sourceHash = crypto.createHash("sha256").update(html, "utf8").digest("hex");
    try {
      const existingOrder = orderId ? portalStore.getOrderById(orderId) : null;
      if (orderId && (!existingOrder || !canAccessOrderRecord(req, existingOrder))) {
        return res.status(404).json({ error: "Order not found." });
      }

      const savedReport = existingOrder?.generatedReports?.[reportType];
      let pdfBuffer = null;
      let cached = false;
      if (savedReport?.sourceHash === sourceHash) {
        try {
          const storedReport = await loadStoredPortalFileBuffer(savedReport, dependencies);
          pdfBuffer = storedReport.buffer;
          cached = true;
        } catch {
          pdfBuffer = null;
        }
      }

      if (!pdfBuffer) {
        const jobKey = `${orderId || "unassigned"}:${reportType}:${sourceHash}`;
        let renderJob = activeReportRenderJobs.get(jobKey);
        if (!renderJob) {
          renderJob = (async () => {
            const renderedBuffer = await renderReportPdfFromHtml(html, dependencies);
            await persistRenderedReportBuffer(
              req,
              existingOrder,
              renderedBuffer,
              { orderId, fileName, reportType, sourceHash },
              dependencies
            );
            return renderedBuffer;
          })();
          activeReportRenderJobs.set(jobKey, renderJob);
          const clearRenderJob = () => {
            if (activeReportRenderJobs.get(jobKey) === renderJob) activeReportRenderJobs.delete(jobKey);
          };
          renderJob.then(clearRenderJob, clearRenderJob);
        }
        pdfBuffer = await renderJob;
      }
      auditLog(req, "render_final_report_pdf", "success", {
        bytes: pdfBuffer.length,
        cached,
        fileName,
        orderId,
        reportType,
      });
      if (responseMode === "saved-url") {
        return res.json({ ready: true, cached, orderId, reportType });
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.setHeader("Cache-Control", "no-store");
      return res.send(pdfBuffer);
    } catch (error) {
      auditLog(req, "render_final_report_pdf", "failed", {
        reason: error?.message || "render_error",
      });
      const reason = String(error?.message || "").trim();
      return res.status(500).json({
        error: reason ? `Unable to generate final report PDF. ${reason}` : "Unable to generate final report PDF.",
      });
    }
  });

  app.post("/api/orders/publish-final-report", async (req, res) => {
    if (!hasReportPdfAccess(req)) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const orderId = String(req.body?.orderId || "").trim();
    const html = String(req.body?.html || "");
    const oruMessage = String(req.body?.oruMessage || "").trim();
    const fileName = sanitizeReportPdfFileName(req.body?.fileName || `Order_${orderId || Date.now()}_Final_Report.pdf`);
    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required." });
    }
    if (!html.trim()) {
      return res.status(400).json({ error: "Final report HTML content is required." });
    }
    if (!oruMessage) {
      return res.status(400).json({ error: "An ORU message built from the latest saved results is required." });
    }
    if (oruMessage.length > 1024 * 1024) {
      return res.status(413).json({ error: "ORU message is too large." });
    }
    if (!oruMessage.startsWith("MSH|") || !oruMessage.includes("|ORU^R01|")) {
      return res.status(400).json({ error: "A valid HL7 ORU^R01 message is required." });
    }
    if (html.length > 4 * 1024 * 1024) {
      return res.status(413).json({ error: "Final report HTML content is too large." });
    }

    try {
      const existingOrder = portalStore.getOrderById(orderId);
      if (!existingOrder || !canAccessOrderRecord(req, existingOrder)) {
        return res.status(404).json({ error: "Order not found." });
      }

      const sourceHash = crypto.createHash("sha256").update(html, "utf8").digest("hex");
      const oruSourceHash = crypto.createHash("sha256").update(oruMessage, "utf8").digest("hex");
      const pdfBuffer = await renderReportPdfFromHtml(html, dependencies);
      await persistRenderedReportBuffer(
        req,
        existingOrder,
        pdfBuffer,
        { orderId, fileName, reportType: "final", sourceHash },
        dependencies
      );
      const refreshedOrder = portalStore.getOrderById(orderId) || existingOrder;
      const prePublishedAt = new Date().toISOString();
      const prePublishedBy = String(
        req?.session?.user?.email
        || req?.session?.user?.displayName
        || req?.session?.clientUser?.username
        || "system"
      ).trim();
      const nextPharmd = {
        ...((refreshedOrder?.pharmd && typeof refreshedOrder.pharmd === "object") ? refreshedOrder.pharmd : {}),
        oruMessage,
        oruSourceHash,
        oruGeneratedAt: prePublishedAt,
        status: "ready",
        sendStatus: "ready",
        deliveryStatus: "ready",
        error: "",
        lastError: "",
        prePublishedAt,
        prePublishedBy,
        prePublishedFileName: fileName,
        readyForPharmdAt: prePublishedAt,
      };
      [
        "sentAt",
        "submittedAt",
        "lastAttemptAt",
        "connectionEstablishedAt",
        "remotePath",
        "receivedAt",
        "pdfReceivedAt",
        "reportReceivedAt",
        "reportReceivedFileName",
        "reportReceivedRemotePath",
        "reportReceivedAccession",
        "reportReceivedMatchedBy",
        "reportReceivedSource",
        "receivedReport",
        "receiptAutoCheckCount",
        "receiptManualCheckCount",
        "receiptLastCheckedAt",
        "receiptLastCheckSource",
        "receiptLastCheckResult",
        "receiptLastError",
        "receiptNextCheckAt",
        "receiptPollingStatus",
        "receiptPollingStoppedAt",
      ].forEach((key) => delete nextPharmd[key]);

      const savedOrder = portalStore.upsertOrders([
        {
          ...refreshedOrder,
          updatedAt: prePublishedAt,
          pharmd: nextPharmd,
        },
      ])[0];

      auditLog(req, "prepublish_final_report", "success", {
        orderId,
        fileName,
        sourceHash,
        oruSourceHash,
        storedToS3: Boolean(
          savedOrder?.generatedReports?.final?.bucket
          && savedOrder?.generatedReports?.final?.key
          && !isLocalGeneratedReportRecord(savedOrder?.generatedReports?.final)
        ),
      });

      return res.json({
        message: `PrePublish completed for Order #${orderId}. Final report is ready for PharmD.`,
        order: savedOrder,
      });
    } catch (error) {
      auditLog(req, "prepublish_final_report", "failed", {
        orderId,
        reason: error?.message || "unexpected_error",
      });
      return res.status(500).json({
        error: error?.message || "Unable to prepublish final report.",
      });
    }
  });

  app.get("/api/orders/:orderId/publish-fax-details", requireAuthenticatedUser, async (req, res) => {
    try {
      const orderId = String(req.params.orderId || "").trim();
      if (!orderId) {
        return res.status(400).json({ error: "Order ID is required." });
      }

      const existingOrder = portalStore.getOrderById(orderId);
      if (!existingOrder || !canAccessOrderRecord(req, existingOrder)) {
        return res.status(404).json({ error: "Order not found." });
      }

      const {
        recipientFaxDigits,
        recipientFaxNumber,
        recipientAvailable,
      } = resolveOrderFaxRecipient(existingOrder, dependencies);

      auditLog(req, "view_publish_fax_details", "success", {
        orderId,
        senderFaxNumber: srfaxConfig.displayNumber,
        recipientFaxNumber: recipientFaxNumber || "",
        recipientAvailable,
      });

      return res.json({
        senderFaxNumber: srfaxConfig.displayNumber,
        recipientFaxNumber: recipientFaxNumber || "",
        recipientFaxDigits,
        recipientAvailable,
      });
    } catch (error) {
      auditLog(req, "view_publish_fax_details", "failed", {
        orderId: String(req.params.orderId || ""),
        reason: error?.message || "unexpected_error",
      });
      return res.status(Number(error?.statusCode) || 500).json({
        error: error?.message || "Unable to load fax details.",
      });
    }
  });

  app.post("/api/orders/:orderId/publish-fax", async (req, res) => {
    if (!hasReportPdfAccess(req)) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required." });
    }
    if (!req.body?.confirmed) {
      return res.status(400).json({ error: "Fax send confirmation is required." });
    }

    const existingOrder = portalStore.getOrderById(orderId);
    if (!existingOrder || !canAccessOrderRecord(req, existingOrder)) {
      return res.status(404).json({ error: "Order not found." });
    }

    const requestedBy = String(
      req?.session?.user?.email
      || req?.session?.user?.displayName
      || req?.session?.clientUser?.username
      || "system"
    ).trim();
    const senderEmail = resolvePublishFaxSenderEmail(req, srfaxConfig.senderEmail);

    try {
      let faxResult = null;

      if (publishFaxMode === "disabled") {
        return res.status(503).json({
          error: "Fax publishing is disabled. Configure SRFax credentials and enable LABCENTER_PUBLISH_FAX_MODE to send faxes.",
        });
      }

      const {
        pdfBuffer,
        fileName,
        finalReport,
        pharmdReport,
        reportType,
      } = await buildPublishFaxPdf(orderId, existingOrder, dependencies);
      const {
        recipientFaxDigits,
        recipientFaxNumber,
        recipientAvailable,
      } = resolveOrderFaxRecipient(existingOrder, dependencies);
      if (!recipientAvailable) {
        return res.status(404).json({
          error: "Facility fax number is not configured for this order.",
        });
      }

      if (publishFaxMode === "simulated") {
        faxResult = {
          status: "simulated",
          faxDetailsId: `SIM-${Date.now()}`,
          result: "Simulated fax queue request",
          message: `Fax simulated successfully for ${recipientFaxNumber}.`,
          mode: "simulated",
        };
      } else if (publishFaxMode === "log") {
        faxResult = {
          status: "logged",
          faxDetailsId: `LOG-${Date.now()}`,
          result: "Logged fax queue request",
          message: `Fax request logged for ${recipientFaxNumber}.`,
          mode: "log",
        };
        console.info("[publish-fax]", {
          orderId,
          senderFaxNumber: srfaxConfig.displayNumber,
          recipientFaxNumber,
          recipientFaxDigits,
          senderEmail,
          fileName,
        });
      } else {
        faxResult = await queueSrfaxFax({
          orderId,
          fileName,
          pdfBuffer,
          senderEmail,
          recipientFaxDigits,
          recipientFaxNumber,
          srfaxConfig,
        });
      }

      const publishedAt = new Date().toISOString();
      const savedOrder = portalStore.upsertOrders([
        {
          ...existingOrder,
          updatedAt: publishedAt,
          publishedReports: {
            ...(existingOrder?.publishedReports && typeof existingOrder.publishedReports === "object"
              ? existingOrder.publishedReports
              : {}),
            final: createPublishFaxRecord(existingOrder?.publishedReports?.final, {
              publishedAt,
              publishedBy: requestedBy,
              senderEmail,
              fileName,
              faxDetailsId: faxResult.faxDetailsId,
              result: faxResult.result,
              status: faxResult.status,
              mode: faxResult.mode,
              endpoint: faxResult.mode === "live" ? srfaxConfig.endpoint : "",
              recipientFaxDigits,
            }, {
              senderFaxNumber: srfaxConfig.displayNumber,
              recipientFaxNumber,
            }),
          },
        },
      ])[0];

      auditLog(req, "publish_final_report_fax", "success", {
        orderId,
        mode: faxResult.mode,
        faxDetailsId: faxResult.faxDetailsId,
        senderFaxNumber: srfaxConfig.displayNumber,
        recipientFaxNumber,
        recipientFaxDigits,
        senderEmail,
        finalBucket: finalReport.bucket,
        finalKey: finalReport.key,
        pharmdBucket: pharmdReport?.bucket || "",
        pharmdKey: pharmdReport?.key || "",
        reportType,
        bytes: pdfBuffer.length,
      });

      return res.json({
        ok: true,
        message: faxResult.message,
        fax: {
          mode: faxResult.mode,
          status: faxResult.status,
          faxDetailsId: faxResult.faxDetailsId,
          senderFaxNumber: srfaxConfig.displayNumber,
          recipientFaxNumber,
          recipientFaxDigits,
          senderEmail,
        },
        order: savedOrder,
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode) || (
        /not found/i.test(String(error?.message || "")) ? 404
          : /disabled|configured/i.test(String(error?.message || "")) ? 503
          : 502
      );
      auditLog(req, "publish_final_report_fax", "failed", {
        orderId,
        mode: publishFaxMode,
        reason: error?.message || "unexpected_error",
        senderFaxNumber: srfaxConfig.displayNumber,
        recipientFaxNumber: "",
        senderEmail,
      });
      return res.status(statusCode).json({
        error: error?.message || "Unable to send fax.",
      });
    }
  });
}

module.exports = {
  normalizeSrfaxRecipientFaxDigits,
  registerReportPublishingRoutes,
};
