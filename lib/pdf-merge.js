const { PDFDocument } = require("pdf-lib");

async function loadPdfDocument(buffer, label = "PDF") {
  try {
    return await PDFDocument.load(buffer);
  } catch (error) {
    const message = String(error?.message || "").trim();
    throw new Error(message ? `Unable to load ${label}. ${message}` : `Unable to load ${label}.`);
  }
}

async function mergePdfBuffers(buffers) {
  const entries = Array.isArray(buffers) ? buffers : [];
  if (!entries.length) {
    throw new Error("At least one PDF is required to build a combined document.");
  }

  const mergedPdf = await PDFDocument.create();
  for (const entry of entries) {
    const buffer = Buffer.isBuffer(entry?.buffer) ? entry.buffer : Buffer.from(entry?.buffer || []);
    if (!buffer.length) {
      throw new Error(`Combined PDF source '${String(entry?.label || "PDF").trim() || "PDF"}' is empty.`);
    }
    const sourcePdf = await loadPdfDocument(buffer, String(entry?.label || "PDF").trim() || "PDF");
    const pageIndexes = sourcePdf.getPageIndices();
    const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndexes);
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  return Buffer.from(await mergedPdf.save());
}

module.exports = {
  mergePdfBuffers,
};
