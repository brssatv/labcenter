const { PDFDocument } = require("pdf-lib");

async function loadPdfDocument(buffer, label = "PDF") {
  try {
    return await PDFDocument.load(buffer);
  } catch (error) {
    const message = String(error?.message || "").trim();
    throw new Error(message ? `Unable to load ${label}. ${message}` : `Unable to load ${label}.`);
  }
}

function normalizePageSizeValue(pageSize) {
  const width = Number(pageSize?.width);
  const height = Number(pageSize?.height);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("Normalized PDF page size must include positive width and height values.");
  }
  return { width, height };
}

function resolveNormalizedPageSize(mode, loadedEntries) {
  if (!mode) return null;
  if (typeof mode === "object") {
    return normalizePageSizeValue(mode);
  }

  const entries = Array.isArray(loadedEntries) ? loadedEntries : [];
  const pickPage = (candidates) => {
    for (const candidate of candidates) {
      const firstPage = candidate?.sourcePdf?.getPages?.()?.[0];
      if (firstPage) {
        return {
          width: firstPage.getWidth(),
          height: firstPage.getHeight(),
        };
      }
    }
    return null;
  };

  if (mode === "first-source") {
    return pickPage(entries);
  }
  if (mode === "last-source") {
    return pickPage([...entries].reverse());
  }

  throw new Error(`Unsupported PDF page normalization mode '${String(mode)}'.`);
}

async function mergePdfBuffers(buffers, options = {}) {
  const entries = Array.isArray(buffers) ? buffers : [];
  if (!entries.length) {
    throw new Error("At least one PDF is required to build a combined document.");
  }

  const loadedEntries = [];
  for (const entry of entries) {
    const buffer = Buffer.isBuffer(entry?.buffer) ? entry.buffer : Buffer.from(entry?.buffer || []);
    if (!buffer.length) {
      throw new Error(`Combined PDF source '${String(entry?.label || "PDF").trim() || "PDF"}' is empty.`);
    }
    loadedEntries.push({
      entry,
      sourcePdf: await loadPdfDocument(buffer, String(entry?.label || "PDF").trim() || "PDF"),
    });
  }

  const mergedPdf = await PDFDocument.create();
  const normalizedPageSize = resolveNormalizedPageSize(options.normalizePageSize, loadedEntries);

  for (const loadedEntry of loadedEntries) {
    const sourcePdf = loadedEntry.sourcePdf;
    if (!normalizedPageSize) {
      const pageIndexes = sourcePdf.getPageIndices();
      const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndexes);
      copiedPages.forEach((page) => mergedPdf.addPage(page));
      continue;
    }

    for (const sourcePage of sourcePdf.getPages()) {
      const targetPage = mergedPdf.addPage([normalizedPageSize.width, normalizedPageSize.height]);
      const embeddedPage = await mergedPdf.embedPage(sourcePage);
      const sourceWidth = sourcePage.getWidth();
      const sourceHeight = sourcePage.getHeight();
      const scale = Math.min(
        normalizedPageSize.width / sourceWidth,
        normalizedPageSize.height / sourceHeight
      );
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      targetPage.drawPage(embeddedPage, {
        x: (normalizedPageSize.width - drawWidth) / 2,
        y: (normalizedPageSize.height - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight,
      });
    }
  }

  return Buffer.from(await mergedPdf.save());
}

module.exports = {
  mergePdfBuffers,
};
