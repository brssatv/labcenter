const fs = require("node:fs");
const path = require("node:path");

const { parseIcdDatasetText } = require("../assets/icd-code-utils.js");

const repoRoot = path.resolve(__dirname, "..");
const defaultInputPath = "/Users/greyhouse/Documents/untitled folder/icd10cm-code-descriptions-2027/icd10cm-codes-2027.txt";
const inputPath = path.resolve(process.argv[2] || defaultInputPath);
const outputPath = path.resolve(process.argv[3] || path.join(repoRoot, "assets", "icd-code-data.js"));

const raw = fs.readFileSync(inputPath, "utf8");
const records = parseIcdDatasetText(raw).map((record) => [record.code, record.description]);

const output = `(function initIcdCodeData(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LabCenterIcdCodeData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => ({
  version: "2027",
  recordCount: ${records.length},
  records: ${JSON.stringify(records)},
}));
`;

fs.writeFileSync(outputPath, output, "utf8");
process.stdout.write(`Wrote ${records.length} ICD records to ${outputPath}\n`);
