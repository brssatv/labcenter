const fs = require("fs");
const path = require("path");

let pdfjs = null;
let createCanvas = null;
let DOMMatrix = null;
let ImageData = null;
let Path2D = null;
let loadImage = null;
let createWorker = null;
let PSM = null;
let scanRuntimeError = null;

const standardFontDataUrl = `${path.join(__dirname, "..", "node_modules", "pdfjs-dist", "standard_fonts")}${path.sep}`;
const tesseractLangPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "@tesseract.js-data",
  "eng",
  "4.0.0"
);
const tesseractCachePath = path.join(__dirname, "..", "data", "ocr-cache");
const ocrScale = 2.75;

function ensureScanRuntime() {
  if (scanRuntimeError) {
    throw scanRuntimeError;
  }
  if (pdfjs && createCanvas && loadImage && createWorker && PSM) {
    return;
  }

  try {
    const canvasRuntime = require("@napi-rs/canvas");
    ({ createCanvas, DOMMatrix, ImageData, Path2D, loadImage } = canvasRuntime);

    global.DOMMatrix = global.DOMMatrix || DOMMatrix;
    global.ImageData = global.ImageData || ImageData;
    global.Path2D = global.Path2D || Path2D;

    pdfjs = require("pdfjs-dist/legacy/build/pdf.mjs");
    ({ createWorker, PSM } = require("tesseract.js"));
  } catch (error) {
    scanRuntimeError = new Error(
      `Requisition scan OCR is unavailable on this machine: ${error?.message || "missing optional dependencies"}.`
    );
    throw scanRuntimeError;
  }
}

let ocrWorkerPromise = null;

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLookup(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegexPattern(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function createCanvasFromImageBuffer(imageBuffer) {
  return loadImage(imageBuffer).then((image) => {
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, image.width, image.height);
    context.drawImage(image, 0, 0);
    return {
      canvas,
      width: image.width,
      height: image.height,
      pngBuffer: canvas.toBuffer("image/png"),
    };
  });
}

function cropDarkRatio(canvasContext, box) {
  const { x, y, w, h } = box;
  const inset = Math.max(1, Math.round(Math.min(w, h) * 0.18));
  const image = canvasContext.getImageData(Math.max(0, x), Math.max(0, y), Math.max(1, w), Math.max(1, h));
  let dark = 0;
  let total = 0;
  for (let row = inset; row < h - inset; row += 1) {
    for (let col = inset; col < w - inset; col += 1) {
      const index = (row * w + col) * 4;
      const gray = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
      if (gray < 170) dark += 1;
      total += 1;
    }
  }
  return total ? dark / total : 0;
}

async function detectTemplateSelections(pngBuffer) {
  const page = await createCanvasFromImageBuffer(pngBuffer);
  const context = page.canvas.getContext("2d");
  const box = (x, y, w, h) => ({
    x: Math.round(page.width * x),
    y: Math.round(page.height * y),
    w: Math.max(8, Math.round(page.width * w)),
    h: Math.max(8, Math.round(page.height * h)),
  });

  const selectionGroups = [
    {
      key: "sex",
      minScore: 0.015,
      minDelta: 0.01,
      options: [
        { value: "Male", box: box(0.2745, 0.2091, 0.0183, 0.0141) },
        { value: "Female", box: box(0.3412, 0.2081, 0.0209, 0.0162) },
      ],
    },
    {
      key: "ethnicity",
      minScore: 0.04,
      minDelta: 0.01,
      options: [
        { value: "Hispanic", box: box(0.7255, 0.2959, 0.0183, 0.0141) },
        { value: "Non-Hispanic", box: box(0.8595, 0.2959, 0.0183, 0.0141) },
      ],
    },
  ];

  const values = {};
  selectionGroups.forEach((group) => {
    const scored = group.options.map((option) => ({
      value: option.value,
      score: cropDarkRatio(context, option.box),
    }));
    scored.sort((a, b) => b.score - a.score);
    const [best, next] = scored;
    if (!best || best.score < group.minScore) return;
    if (next && best.score - next.score < group.minDelta) return;
    values[group.key] = best.value;
  });
  return values;
}

async function getOcrWorker() {
  ensureScanRuntime();
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      ensureDir(tesseractCachePath);
      return createWorker("eng", 1, {
        langPath: tesseractLangPath,
        cachePath: tesseractCachePath,
      });
    })();
  }
  return ocrWorkerPromise;
}

async function recognizePageText(pngBuffer) {
  const worker = await getOcrWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: "1",
  });
  const result = await worker.recognize(pngBuffer);
  return normalizeText(result?.data?.text || "");
}

// OCR each column half separately to prevent cross-column text merging.
async function recognizeColumns(leftPng, rightPng) {
  const worker = await getOcrWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
    preserve_interword_spaces: "1",
  });
  const [leftResult, rightResult] = await Promise.all([
    worker.recognize(leftPng),
    worker.recognize(rightPng),
  ]);
  return [
    normalizeText(leftResult?.data?.text || ""),
    normalizeText(rightResult?.data?.text || ""),
  ]
    .filter(Boolean)
    .join("\n");
}

// Slice a canvas buffer into left and right halves.
function splitCanvasIntoHalves(fullCanvas) {
  const halfW = Math.ceil(fullCanvas.width / 2);
  const h = fullCanvas.height;

  const leftCanvas = createCanvas(halfW, h);
  const leftCtx = leftCanvas.getContext("2d");
  leftCtx.fillStyle = "#ffffff";
  leftCtx.fillRect(0, 0, halfW, h);
  leftCtx.drawImage(fullCanvas, 0, 0, halfW, h, 0, 0, halfW, h);

  const rightW = fullCanvas.width - halfW;
  const rightCanvas = createCanvas(rightW, h);
  const rightCtx = rightCanvas.getContext("2d");
  rightCtx.fillStyle = "#ffffff";
  rightCtx.fillRect(0, 0, rightW, h);
  rightCtx.drawImage(fullCanvas, halfW, 0, rightW, h, 0, 0, rightW, h);

  return {
    leftPng: leftCanvas.toBuffer("image/png"),
    rightPng: rightCanvas.toBuffer("image/png"),
  };
}

function groupTokensIntoRows(tokens) {
  const rows = [];
  const sorted = [...tokens].sort((a, b) => b.y - a.y || a.x - b.x);
  sorted.forEach((token) => {
    const existing = rows.find((row) => Math.abs(row.y - token.y) <= Math.max(3, token.h * 0.45));
    if (existing) {
      existing.tokens.push(token);
      existing.y = (existing.y + token.y) / 2;
      existing.xMin = Math.min(existing.xMin, token.x);
      existing.xMax = Math.max(existing.xMax, token.x + token.w);
      return;
    }
    rows.push({
      y: token.y,
      xMin: token.x,
      xMax: token.x + token.w,
      tokens: [token],
    });
  });

  return rows
    .map((row) => {
      row.tokens.sort((a, b) => a.x - b.x);
      const text = normalizeText(row.tokens.map((token) => token.text).join(" "));
      return {
        ...row,
        text,
        lookup: normalizeLookup(text),
      };
    })
    .sort((a, b) => b.y - a.y);
}

function buildPdfRows(items, pageWidth) {
  const tokens = items
    .map((item) => {
      const text = normalizeText(item?.str || "");
      if (!text) return null;
      const x = Number(item?.transform?.[4]) || 0;
      const y = Number(item?.transform?.[5]) || 0;
      return {
        text,
        x,
        y,
        w: Number(item?.width) || Math.max(text.length * 4, 8),
        h: Math.abs(Number(item?.height) || 10),
      };
    })
    .filter(Boolean);

  const splitX = pageWidth * 0.5;
  const leftTokens = tokens.filter((token) => token.x < splitX);
  const rightTokens = tokens.filter((token) => token.x >= splitX);

  return {
    all: groupTokensIntoRows(tokens),
    left: groupTokensIntoRows(leftTokens),
    right: groupTokensIntoRows(rightTokens),
  };
}

async function extractPdfLayout(fileBuffer) {
  const document = await pdfjs.getDocument({
    data: new Uint8Array(fileBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    standardFontDataUrl,
  }).promise;
  const page = await document.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();
  const rows = buildPdfRows(Array.isArray(textContent?.items) ? textContent.items : [], viewport.width);

  const renderViewport = page.getViewport({ scale: ocrScale });
  const canvas = createCanvas(Math.ceil(renderViewport.width), Math.ceil(renderViewport.height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport: renderViewport }).promise;

  const { leftPng, rightPng } = splitCanvasIntoHalves(canvas);

  return {
    pageCount: document.numPages || 1,
    rows,
    pageWidth: viewport.width,
    pageHeight: viewport.height,
    pngBuffer: canvas.toBuffer("image/png"),
    leftPngBuffer: leftPng,
    rightPngBuffer: rightPng,
    text: rows.all.map((row) => row.text).join("\n"),
  };
}

function findRowsWithLabels(rows, labels) {
  const lookups = labels.map((label) => normalizeLookup(label));
  return rows.filter((row) =>
    lookups.some((label) => row.lookup === label || row.lookup.startsWith(`${label} `) || row.lookup.includes(`${label}:`))
  );
}

function trimValueBeforeKnownLabel(value, knownLabels) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const lowered = raw.toLowerCase();
  let cutIndex = raw.length;
  knownLabels.forEach((label) => {
    const candidate = String(label || "").toLowerCase();
    const index = lowered.indexOf(candidate);
    if (index > 0 && index < cutIndex) cutIndex = index;
  });
  return normalizeText(raw.slice(0, cutIndex).replace(/[:\-–|]+$/g, ""));
}

function extractInlineValue(text, labels, knownLabels = []) {
  const source = normalizeText(text);
  if (!source) return "";

  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\b)${escapeRegexPattern(label)}\\s*(?:[:#.]|\\s)\\s*(.+)$`, "i");
    const match = source.match(pattern);
    if (match?.[1]) {
      const candidate = trimValueBeforeKnownLabel(match[1], knownLabels);
      if (candidate) return candidate;
    }
  }

  return "";
}

function looksLikeLabelRow(row, allLabels) {
  return allLabels.some((label) => row.lookup === normalizeLookup(label));
}

function extractNeighborValue(rows, index, allLabels, offsets = [1, -1, 2]) {
  for (const offset of offsets) {
    const row = rows[index + offset];
    if (!row) continue;
    if (looksLikeLabelRow(row, allLabels)) continue;
    if (row.text.includes(":") && /[A-Za-z]/.test(row.text)) continue;
    const candidate = normalizeText(row.text);
    if (candidate) return candidate;
  }
  return "";
}

function extractValueFromRows(rows, labels, allLabels, options = {}) {
  const matches = findRowsWithLabels(rows, labels);
  for (const row of matches) {
    const inline = extractInlineValue(row.text, labels, allLabels);
    if (inline) return inline;
  }

  for (const row of matches) {
    const index = rows.indexOf(row);
    const neighbor = extractNeighborValue(rows, index, allLabels, options.offsets);
    if (neighbor) return neighbor;
  }

  return "";
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length >= 10 ? digits.slice(0, 10) : "";
}

function normalizeZip(value) {
  const digits = String(value || "")
    .replace(/[OoQq]/g, "0")
    .replace(/[Il|!]/g, "1")
    .replace(/[Zz]/g, "2")
    .replace(/[Ss]/g, "5")
    .replace(/[Tt]/g, "6")
    .replace(/[Bb]/g, "8")
    .replace(/\D/g, "");
  return digits.slice(0, 5);
}

function normalizeDate(value) {
  const raw = normalizeText(value).replace(/[.]/g, "/");
  if (!raw) return "";

  // Standard slash/hyphen-separated: MM/DD/YY or MM/DD/YYYY
  const match = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (match) {
    let month = Number(match[1]);
    let day = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Space-separated fallback: "1 25 01" or "1 25 2001" — OCR often misreads slashes as spaces
  const spaceMatch = raw.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})$/);
  if (spaceMatch) {
    let month = Number(spaceMatch[1]);
    let day = Number(spaceMatch[2]);
    let year = Number(spaceMatch[3]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return "";
}

function normalizeTime(value) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return "";
  const match = raw.match(/(\d{1,2})[:.](\d{2})(?:\s*(am|pm))?/);
  if (!match) return "";

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3];
  if (minute > 59 || hour > 23) return "";
  if (meridiem) {
    hour %= 12;
    if (meridiem === "pm") hour += 12;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeRace(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const lookup = normalizeLookup(raw);
  if (lookup.includes("white") || lookup.includes("ohite")) return "White";
  if (lookup.includes("black")) return "Black or African American";
  if (lookup.includes("asian")) return "Asian";
  if (lookup.includes("native hawaiian")) return "Native Hawaiian or Other Pacific Islander";
  if (lookup.includes("american indian")) return "American Indian or Alaska Native";
  return raw;
}

function normalizeEthnicity(value) {
  const lookup = normalizeLookup(value);
  if (!lookup) return "";
  if (lookup.includes("non hispanic")) return "Non-Hispanic";
  if (lookup.includes("hispanic")) return "Hispanic";
  return "";
}

function normalizeCounty(value) {
  const raw = normalizeText(value).replace(/[^A-Za-z\s'-]/g, "").trim();
  if (raw.length < 5) return "";
  const lookup = normalizeLookup(raw);
  if (
    lookup.includes("requisition") ||
    lookup.includes("practice information") ||
    lookup.includes("patient information") ||
    lookup.includes("billing information") ||
    lookup.includes("test requested")
  ) {
    return "";
  }
  return raw;
}

function normalizeSex(value) {
  const raw = normalizeText(value);
  const lookup = normalizeLookup(raw);
  if (!lookup) return "";
  const hasMale = /\bmale\b/i.test(raw);
  const hasFemale = /\bfemale\b/i.test(raw);
  if (/\bx\b\s*female/i.test(raw) || /female\s*\bx\b/i.test(raw)) return "Female";
  if (/\bx\b\s*male/i.test(raw) || /male\s*\bx\b/i.test(raw)) return "Male";
  if (hasFemale && !hasMale) return "Female";
  if (hasMale && !hasFemale) return "Male";
  return "";
}

function splitFullName(value) {
  const cleaned = normalizeText(value)
    .replace(/^name[:\s-]*/i, "")
    .replace(/[|]/g, " ")
    .trim();
  if (!cleaned) return {};

  const truncated = cleaned
    .replace(/\b(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd|suite|ste|zip|state|country|city)\b.*$/i, "")
    .replace(/\d.*$/, "")
    .trim();
  if (!truncated) return {};

  const parts = truncated.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0] };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts.at(-1),
  };
}

const plainFieldLabels = {
  facilityName: ["Practice Name", "Facility", "Facility Name"],
  provider: ["Physician Name", "Provider Name", "Ordering Provider", "Provider"],
  providerNpi: ["Physician NPI", "Physician NPI#", "Provider NPI", "NPI"],
  patientName: ["Patient Name", "Patient Full Name", "Full Name", "Name"],
  address: ["Address 1", "Address", "Street Address"],
  dob: ["Patient DOB", "Date Of Birth", "DOB", "Birth Date"],
  sex: ["Sex", "Gender"],
  phone: ["Phone number with area code", "Contact Number", "Phone Number", "Phone"],
  email: ["Email", "Email Address"],
  county: ["Residence County", "County"],
  race: ["Race"],
  ethnicity: ["Ethnicity"],
  primaryInsurance: ["Insurance Name and Policy No", "Primary Insurance Provider", "Primary Insurance"],
  collectionDate: ["Collection Date", "Date Of Collection"],
  collectionTime: ["Time Of Collection", "Collection Time", "Time"],
};

const allKnownLabels = Object.values(plainFieldLabels)
  .flat()
  .concat([
    "Practice Address",
    "Practice Phone",
    "City",
    "Country",
    "State",
    "Zip Code",
    "ZIP Code",
    "Physician Name",
    "Physician NPI",
    "ICD",
    "Medicare No",
    "Medicaid No",
    "Collector Name",
    "Collection location",
  ]);

function parseLayoutRows(rowsByColumn) {
  const values = {};
  const matchedFields = [];

  const setValue = (key, value) => {
    const normalized = normalizeText(value);
    if (!normalized || values[key]) return;
    values[key] = normalized;
    matchedFields.push(key);
  };

  const facilityName = extractValueFromRows(rowsByColumn.right, plainFieldLabels.facilityName, allKnownLabels);
  setValue("facilityName", facilityName);

  const provider = extractValueFromRows(rowsByColumn.right, plainFieldLabels.provider, allKnownLabels, {
    offsets: [-1, 1, 2],
  });
  setValue("provider", provider);

  const providerNpiRaw = extractValueFromRows(rowsByColumn.right, plainFieldLabels.providerNpi, allKnownLabels);
  const providerNpi = String(providerNpiRaw || "").replace(/\D/g, "");
  if (providerNpi.length >= 10) setValue("providerNpi", providerNpi.slice(0, 10));

  const patientName = extractValueFromRows(rowsByColumn.left, plainFieldLabels.patientName, allKnownLabels, {
    offsets: [1, 2],
  });
  const nameParts = splitFullName(patientName);
  setValue("firstName", nameParts.firstName);
  setValue("middleName", nameParts.middleName);
  setValue("lastName", nameParts.lastName);

  const address = extractValueFromRows(rowsByColumn.left, plainFieldLabels.address, allKnownLabels, {
    offsets: [1, 2],
  });
  setValue("address", address);

  const sexRow = extractValueFromRows(rowsByColumn.left, plainFieldLabels.sex, allKnownLabels);
  setValue("sex", normalizeSex(sexRow));

  const dobRow = extractValueFromRows(rowsByColumn.left, plainFieldLabels.dob, allKnownLabels);
  setValue("dob", normalizeDate(dobRow));

  const phoneSource = extractValueFromRows(rowsByColumn.left, plainFieldLabels.phone, allKnownLabels, {
    offsets: [1, 2, -1],
  });
  const phone = normalizePhone(phoneSource);
  if (phone) setValue("phone", phone);

  const emailSource = extractValueFromRows(rowsByColumn.left, plainFieldLabels.email, allKnownLabels, {
    offsets: [1],
  });
  if (/@/.test(emailSource)) setValue("email", emailSource.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "");

  const county = extractValueFromRows(rowsByColumn.left, plainFieldLabels.county, allKnownLabels, {
    offsets: [1, 2],
  });
  setValue("county", normalizeCounty(county));

  const race = extractValueFromRows(rowsByColumn.left, plainFieldLabels.race, allKnownLabels, {
    offsets: [0],
  });
  setValue("race", normalizeRace(race));

  const ethnicity = extractValueFromRows(rowsByColumn.left, plainFieldLabels.ethnicity, allKnownLabels, {
    offsets: [0],
  });
  setValue("ethnicity", normalizeEthnicity(ethnicity));

  const zipRow = rowsByColumn.left.find((row) => row.lookup.includes("zip code"));
  if (zipRow) {
    const zipInline = extractInlineValue(zipRow.text, ["Zip Code", "ZIP Code"], allKnownLabels);
    const zipcode = normalizeZip(zipInline || zipRow.text);
    if (zipcode) setValue("zipcode", zipcode);
  }

  const stateRow = rowsByColumn.left.find((row) => row.lookup.includes("state"));
  if (stateRow) {
    const stateInline = extractInlineValue(stateRow.text, ["State"], allKnownLabels);
    if (/^[A-Za-z]{2}$/.test(stateInline || "")) setValue("state", String(stateInline).toUpperCase());
  }

  const insurance = extractValueFromRows(rowsByColumn.all, plainFieldLabels.primaryInsurance, allKnownLabels);
  setValue("primaryInsurance", insurance);

  const collectionLine = rowsByColumn.all.find((row) => row.lookup.includes("collection date"));
  if (collectionLine) {
    const dateMatch = collectionLine.text.match(/Collection Date[:\s]*([0-9A-Za-z\/\-.]+)/i);
    const timeMatch = collectionLine.text.match(/Time[:\s]*([0-9A-Za-z:.\-]+)/i);
    setValue("collectionDate", normalizeDate(dateMatch?.[1] || ""));
    setValue("collectionTime", normalizeTime(timeMatch?.[1] || ""));
  }

  if (!values.country && (values.address || values.state || values.zipcode)) {
    setValue("country", "United States of America");
  }

  return {
    values,
    matchedFields,
  };
}

function extractValueFromPlainText(lines, labels) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const inline = extractInlineValue(line, labels, allKnownLabels);
    if (inline) return inline;

    const lookup = normalizeLookup(line);
    if (labels.some((label) => lookup === normalizeLookup(label))) {
      for (let offset = 1; offset <= 3; offset += 1) {
        const candidate = normalizeText(lines[index + offset] || "");
        if (!candidate) continue;
        if (candidate.includes(":")) continue;
        return candidate;
      }
    }
  }
  return "";
}

function parsePlainText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);

  const values = {};
  const matchedFields = [];

  const setValue = (key, value) => {
    const normalized = normalizeText(value);
    if (!normalized || values[key]) return;
    values[key] = normalized;
    matchedFields.push(key);
  };

  setValue("facilityName", extractValueFromPlainText(lines, plainFieldLabels.facilityName));
  setValue("provider", extractValueFromPlainText(lines, plainFieldLabels.provider));

  const providerNpi = String(extractValueFromPlainText(lines, plainFieldLabels.providerNpi) || "").replace(/\D/g, "");
  if (providerNpi.length >= 10) setValue("providerNpi", providerNpi.slice(0, 10));

  const patientName = extractValueFromPlainText(lines, plainFieldLabels.patientName);
  const nameParts = splitFullName(patientName);
  setValue("firstName", nameParts.firstName);
  setValue("middleName", nameParts.middleName);
  setValue("lastName", nameParts.lastName);

  // Fallback: scan raw OCR text for any "Name: <value>" pattern.
  // Catches cases where the column split put the first name in the left half
  // and the last name in the right half (so label-match only got half the value).
  if (!values.lastName) {
    const nameLineMatch = String(text || "").match(/\bname\s*[:\-]?\s*([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+)+)/i);
    if (nameLineMatch) {
      const fallbackParts = splitFullName(nameLineMatch[1]);
      if (fallbackParts.firstName && !values.firstName) setValue("firstName", fallbackParts.firstName);
      if (fallbackParts.lastName && !values.lastName) setValue("lastName", fallbackParts.lastName);
    }
  }

  setValue("address", extractValueFromPlainText(lines, plainFieldLabels.address));
  setValue("dob", normalizeDate(extractValueFromPlainText(lines, plainFieldLabels.dob)));

  // Fallback: scan raw OCR text for any date near a DOB label.
  // Catches cases where Tesseract outputs slashes as spaces ("1 25 01")
  // or the date lands on a different line than the label.
  if (!values.dob) {
    const dobLabelMatch = String(text || "").match(/(?:date\s+of\s+birth|dob|birth\s+date)\s*[:\-]?\s*([\d][\d\s\/\.\-]{3,14}[\d])/i);
    if (dobLabelMatch) setValue("dob", normalizeDate(dobLabelMatch[1]));
  }

  setValue("sex", normalizeSex(extractValueFromPlainText(lines, plainFieldLabels.sex)));

  const phoneMatch = normalizePhone(extractValueFromPlainText(lines, plainFieldLabels.phone) || String(text || ""));
  if (phoneMatch) setValue("phone", phoneMatch);

  const zipLine = lines.find((line) => normalizeLookup(line).includes("zip code"));
  if (zipLine) {
    const zip = normalizeZip(extractInlineValue(zipLine, ["Zip Code", "ZIP Code"], allKnownLabels) || zipLine);
    if (zip) setValue("zipcode", zip);
  }

  const emailMatch = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch?.[0]) setValue("email", emailMatch[0]);

  setValue("county", normalizeCounty(extractValueFromPlainText(lines, plainFieldLabels.county)));
  setValue("race", normalizeRace(extractValueFromPlainText(lines, plainFieldLabels.race)));
  setValue("ethnicity", normalizeEthnicity(extractValueFromPlainText(lines, plainFieldLabels.ethnicity)));
  setValue("primaryInsurance", extractValueFromPlainText(lines, plainFieldLabels.primaryInsurance));
  setValue("collectionDate", normalizeDate(extractValueFromPlainText(lines, plainFieldLabels.collectionDate)));
  setValue("collectionTime", normalizeTime(extractValueFromPlainText(lines, plainFieldLabels.collectionTime)));

  if (!values.country && (values.address || values.state || values.zipcode)) {
    setValue("country", "United States of America");
  }

  return {
    values,
    matchedFields,
  };
}

function mergeExtractions(primary, secondary) {
  const values = { ...(secondary?.values || {}) };
  const primaryValues = primary?.values || {};
  const groupedKeys = [
    ["firstName", "middleName", "lastName"],
    ["address", "city", "state", "zipcode", "country"],
  ];

  groupedKeys.forEach((group) => {
    if (!group.some((key) => normalizeText(primaryValues[key]))) return;
    group.forEach((key) => {
      delete values[key];
    });
  });

  Object.assign(values, primaryValues);
  const matchedFields = Object.keys(values).filter((key) => normalizeText(values[key]));
  return {
    values,
    matchedFields,
  };
}

async function extractRequisitionScanData(fileBuffer, fileName, mimeType = "") {
  ensureScanRuntime();
  const ext = String(path.extname(fileName || "") || "").toLowerCase();
  let pageCount = 1;
  let baseText = "";
  let engine = "local-ocr";
  let layoutParse = { values: {}, matchedFields: [] };

  if (ext === ".pdf") {
    const layout = await extractPdfLayout(fileBuffer);
    pageCount = layout.pageCount;
    baseText = layout.text;
    layoutParse = parseLayoutRows(layout.rows);

    // Use column-aware OCR: scan left and right halves independently to
    // prevent Tesseract from merging adjacent column text (e.g. "AlleSmt").
    const ocrText = await recognizeColumns(layout.leftPngBuffer, layout.rightPngBuffer);
    const templateSelections = await detectTemplateSelections(layout.pngBuffer);
    engine = "pdf-layout+local-ocr";
    const merged = mergeExtractions(layoutParse, parsePlainText(ocrText));
    Object.entries(templateSelections).forEach(([key, value]) => {
      if (!normalizeText(merged.values[key]) && normalizeText(value)) {
        merged.values[key] = value;
        if (!merged.matchedFields.includes(key)) merged.matchedFields.push(key);
      }
    });
    return {
      pageCount,
      text: [baseText, ocrText].filter(Boolean).join("\n"),
      values: merged.values,
      matchedFields: merged.matchedFields,
      engine,
    };
  }

  // For image files, split the canvas into two halves before OCR to
  // prevent Tesseract from merging text across adjacent columns.
  const imagePage = await createCanvasFromImageBuffer(fileBuffer);
  const { leftPng: imageLeftPng, rightPng: imageRightPng } = splitCanvasIntoHalves(imagePage.canvas);
  const ocrText = await recognizeColumns(imageLeftPng, imageRightPng);
  const parsed = parsePlainText(ocrText);
  return {
    pageCount,
    text: ocrText,
    values: parsed.values,
    matchedFields: parsed.matchedFields,
    engine,
  };
}

module.exports = {
  extractRequisitionScanData,
};
