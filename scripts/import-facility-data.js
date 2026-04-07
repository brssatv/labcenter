const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function findEndOfCentralDirectory(zipBuffer) {
  for (let i = zipBuffer.length - 22; i >= 0; i -= 1) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("Invalid zip: EOCD not found");
}

function readZipEntries(zipBuffer) {
  const eocdOffset = findEndOfCentralDirectory(zipBuffer);
  const centralDirSize = zipBuffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const entryMap = new Map();
  let cursor = centralDirOffset;
  const end = centralDirOffset + centralDirSize;

  while (cursor < end) {
    if (zipBuffer.readUInt32LE(cursor) !== 0x02014b50) break;
    const compressionMethod = zipBuffer.readUInt16LE(cursor + 10);
    const compressedSize = zipBuffer.readUInt32LE(cursor + 20);
    const fileNameLength = zipBuffer.readUInt16LE(cursor + 28);
    const extraFieldLength = zipBuffer.readUInt16LE(cursor + 30);
    const commentLength = zipBuffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(cursor + 42);
    const fileName = zipBuffer.slice(cursor + 46, cursor + 46 + fileNameLength).toString("utf8");

    entryMap.set(fileName, {
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });

    cursor += 46 + fileNameLength + extraFieldLength + commentLength;
  }

  return entryMap;
}

function readZipEntryBuffer(zipBuffer, entries, fileName) {
  const entry = entries.get(fileName);
  if (!entry) return null;
  const localOffset = entry.localHeaderOffset;
  if (zipBuffer.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error(`Invalid local file header for ${fileName}`);
  }
  const fileNameLength = zipBuffer.readUInt16LE(localOffset + 26);
  const extraFieldLength = zipBuffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + fileNameLength + extraFieldLength;
  const compressedData = zipBuffer.slice(dataStart, dataStart + entry.compressedSize);
  if (entry.compressionMethod === 0) return compressedData;
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressedData);
  throw new Error(`Unsupported zip compression method: ${entry.compressionMethod}`);
}

function columnRefToIndex(columnRef) {
  let total = 0;
  for (const char of columnRef) {
    total = total * 26 + (char.charCodeAt(0) - 64);
  }
  return total - 1;
}

function parseSharedStrings(sharedXml) {
  const strings = [];
  const stringItems = sharedXml.match(/<si[\s\S]*?<\/si>/g) || [];
  stringItems.forEach((item) => {
    const fragments = [...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((match) => decodeXmlEntities(match[1]))
      .join("");
    strings.push(fragments);
  });
  return strings;
}

function parseWorksheetRows(sheetXml, sharedStrings) {
  const rows = [];
  const rowMatches = sheetXml.match(/<row\b[\s\S]*?<\/row>/g) || [];

  rowMatches.forEach((rowXml) => {
    const rowData = {};
    const cellMatches = [...rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)];
    cellMatches.forEach((cellMatch) => {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      if (!refMatch) return;
      const colIndex = columnRefToIndex(refMatch[1]);
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "";
      let value = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (type === "s") value = sharedStrings[Number(value)] || "";
      if (type === "inlineStr") {
        value = decodeXmlEntities((body.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "");
      }
      rowData[colIndex] = decodeXmlEntities(value === undefined ? "" : value);
    });

    const keys = Object.keys(rowData).map(Number);
    if (!keys.length) {
      rows.push([]);
      return;
    }
    const maxIndex = Math.max(...keys);
    const row = [];
    for (let i = 0; i <= maxIndex; i += 1) row.push(rowData[i] || "");
    rows.push(row);
  });

  return rows;
}

function sanitizeHeader(header, index) {
  const normalized = String(header || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
  return normalized || `column_${index + 1}`;
}

function parseWorkbookToObjects(filePath) {
  const buffer = fs.readFileSync(filePath);
  const entries = readZipEntries(buffer);
  const sharedBuffer = readZipEntryBuffer(buffer, entries, "xl/sharedStrings.xml");
  const sheetBuffer =
    readZipEntryBuffer(buffer, entries, "xl/worksheets/sheet1.xml") ||
    readZipEntryBuffer(buffer, entries, "xl/worksheets/sheet2.xml");

  if (!sheetBuffer) throw new Error(`No worksheet XML found in ${filePath}`);

  const sharedStrings = sharedBuffer ? parseSharedStrings(sharedBuffer.toString("utf8")) : [];
  const rows = parseWorksheetRows(sheetBuffer.toString("utf8"), sharedStrings).filter((row) =>
    row.some((cell) => String(cell || "").trim())
  );

  if (!rows.length) return [];

  const headers = rows[0].map((cell, index) => sanitizeHeader(cell, index));
  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const item = {};
    headers.forEach((key, idx) => {
      item[key] = String(row[idx] || "").trim();
    });
    out.push(item);
  }
  return out;
}

function main() {
  const accountsPath = process.argv[2];
  const providersPath = process.argv[3];
  if (!accountsPath || !providersPath) {
    throw new Error("Usage: node scripts/import-facility-data.js <Accounts.xlsx> <Providers.xlsx>");
  }

  const accounts = parseWorkbookToObjects(accountsPath);
  const providers = parseWorkbookToObjects(providersPath);

  const payload = {
    importedAt: new Date().toISOString(),
    sourceFiles: {
      accounts: path.resolve(accountsPath),
      providers: path.resolve(providersPath),
    },
    accounts,
    providers,
  };

  const outPath = path.join(__dirname, "..", "data", "facility.json");
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Saved ${accounts.length} accounts and ${providers.length} providers to ${outPath}`);
}

main();
