const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const reportStart = appSource.indexOf("function buildDetectedSummaryReportHtml");
const reportEnd = appSource.indexOf("function writeReportWindowError", reportStart);
const reportSource = appSource.slice(reportStart, reportEnd);

test("final report builds ABR visibility from saved detailed gene names", () => {
  assert.ok(reportStart >= 0 && reportEnd > reportStart);
  assert.match(reportSource, /buildFinalReportAbrSectionState/);
  assert.match(reportSource, /buildAbrSectionState\(context\.testedGeneNames\)/);
  assert.match(reportSource, /variant !== "final" \|\| finalAbrSectionState\.hasAbrRecords/);
  assert.match(reportSource, /\? finalAbrSectionState\.testedGeneNames\s*: summaryReportTestedGenes/);
});

test("both final report pathogen branches render the same conditional ABR block", () => {
  const detectedInsertions = reportSource.match(/\$\{abrDetectedSectionMarkup\}/g) || [];
  const testedInsertions = reportSource.match(/\$\{abrTestedSectionMarkup\}/g) || [];
  assert.equal(detectedInsertions.length, 2);
  assert.equal(testedInsertions.length, 2);
  assert.equal((reportSource.match(/LIST OF ANTIBIOTIC RESISTANT GENES TESTED/g) || []).length, 1);
  assert.equal((reportSource.match(/RESISTANCE GENES DETECTED/g) || []).length, 1);
});

test("both final report pathogen branches style ABR result rows consistently", () => {
  assert.equal((reportSource.match(/\.summary-report-table \{/g) || []).length, 2);
  assert.equal((reportSource.match(/\.summary-report-table td \{/g) || []).length, 2);
  assert.equal((reportSource.match(/\.summary-report-table td\.summary-pathogen \{/g) || []).length, 2);
  assert.equal((reportSource.match(/\.summary-report-table td:last-child \{/g) || []).length, 2);
});

test("final report formulas still normalize the tested pathogen list", () => {
  assert.match(reportSource, /buildReportContext\(order, \{ excludeRnaseP: variant === "final" \}\)/);
  assert.match(reportSource, /collapseSarsCov2PathogenNames/);
  assert.match(reportSource, /hasSarsCov2Targets \? \["SARS-CoV-2"\] : \[\]/);
});
