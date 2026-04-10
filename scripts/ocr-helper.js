#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Tesseract = require("tesseract.js");
const pdfParse = require("pdf-parse");

// Keep OCR language data bundled from dependencies so local runtime caches
// do not need to be committed into the repository.
const tessDataPath = path.join(
  path.dirname(require.resolve("@tesseract.js-data/eng/package.json")),
  "4.0.0"
);

async function createLocalWorker() {
  const worker = await Tesseract.createWorker("eng", 1, {
    langPath: tessDataPath,
    logger: () => {}
  });
  return worker;
}

async function processImage(filePath) {
  const worker = await createLocalWorker();
  const {
    data: { text },
  } = await worker.recognize(filePath);
  await worker.terminate();

  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

  return {
    text: text,
    lines: [...new Set(lines)],
    pageCount: 1,
  };
}

async function processPdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);

  let nativeTextData;
  try {
    nativeTextData = await pdfParse(dataBuffer);
  } catch (err) {
    nativeTextData = { text: "", numpages: 1 };
  }

  const nativeLines = nativeTextData.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Use native text if present
  if (nativeLines.length >= 3) {
    return {
      text: nativeTextData.text,
      lines: [...new Set(nativeLines)],
      pageCount: nativeTextData.numpages || 1,
    };
  }

  // Scanned PDF rendering
  const canvas = require("canvas");
  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

  class NodeCanvasFactory {
    create(width, height) {
      const canvasInstance = canvas.createCanvas(width, height);
      return {
        canvas: canvasInstance,
        context: canvasInstance.getContext("2d"),
      };
    }
    reset(ctx, width, height) {
      ctx.canvas.width = width;
      ctx.canvas.height = height;
    }
    destroy(ctx) {
      ctx.canvas.width = 0;
      ctx.canvas.height = 0;
      ctx.canvas = null;
      ctx.context = null;
    }
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(dataBuffer),
    disableFontFace: true,
    verbosity: 0,
  });

  const pdfDocument = await loadingTask.promise;
  const numPages = pdfDocument.numPages;

  let collectedLines = [];
  let collectedText = "";

  const worker = await createLocalWorker();

  for (let index = 1; index <= numPages; index++) {
    const page = await pdfDocument.getPage(index);
    const viewport = page.getViewport({ scale: 2.2 });
    const canvasFactory = new NodeCanvasFactory();
    const { canvas: canvasAndCtx, context } = canvasFactory.create(viewport.width, viewport.height);

    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvasFactory: canvasFactory,
    }).promise;
    
    const imageBuffer = canvasAndCtx.toBuffer("image/png");

    const {
      data: { text: ocrText },
    } = await worker.recognize(imageBuffer);

    collectedText += ocrText + "\n";
    const newLines = ocrText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    collectedLines.push(...newLines);
  }

  await worker.terminate();

  return {
    text: collectedText,
    lines: [...new Set(collectedLines)],
    pageCount: numPages,
  };
}

async function main() {
  const inputFilePath = process.argv[2];

  if (!inputFilePath || !fs.existsSync(inputFilePath)) {
    console.error("Input file missing");
    process.exit(1);
  }

  const ext = path.extname(inputFilePath).toLowerCase();

  let result;
  try {
    if (ext === ".pdf") {
      result = await processPdf(inputFilePath);
    } else if ([".png", ".jpg", ".jpeg", ".tiff", ".tif", ".heic", ".heif"].includes(ext)) {
      result = await processImage(inputFilePath);
    } else {
      console.error("Unsupported file type");
      process.exit(1);
    }

    console.log(JSON.stringify(result));
  } catch (err) {
    console.error("Error processing file:", err.message);
    process.exit(1);
  }
}

main();
