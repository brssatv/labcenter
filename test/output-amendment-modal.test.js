const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(projectRoot, "app.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(projectRoot, "styles.css"), "utf8");

test("report corrections use the privacy-conscious amendment modal instead of a browser prompt", () => {
  assert.match(appSource, /id="output-amendment-title">Correct patient record/);
  assert.match(appSource, /Protect patient privacy/);
  assert.match(appSource, /Do not include names, dates of birth, medical record numbers, or other patient identifiers\./);
  assert.match(appSource, /textarea id="output-amendment-reason"[^>]+minlength="5"[^>]+maxlength="1000"/);
  assert.match(appSource, /data-submit-amendment disabled>Submit correction/);
  assert.doesNotMatch(appSource, /window\.prompt\("Enter the correction reason/);
});

test("report correction modal includes accessible dialog behavior and responsive styling", () => {
  assert.match(appSource, /role="dialog" aria-modal="true" aria-labelledby="output-amendment-title"/);
  assert.match(appSource, /event\.key === "Escape"/);
  assert.match(appSource, /data-amendment-count/);
  assert.match(stylesSource, /\.output-results-amendment-modal\s*\{/);
  assert.match(stylesSource, /\.output-amendment-actions \.btn-primary:disabled\s*\{/);
  assert.match(stylesSource, /@media \(max-width: 720px\)[\s\S]+\.output-results-amendment-modal/);
});

test("unpublished amendments receive a clear workflow banner and record highlight", () => {
  assert.match(appSource, /This record is being amended and the correction has not been published yet\./);
  assert.match(appSource, /The previously published report remains the official version\./);
  assert.match(appSource, /Pending - Amendment/);
  assert.match(appSource, /output-results-row-amendment/);
  assert.match(stylesSource, /\.output-results-amendment-banner\s*\{/);
  assert.match(stylesSource, /\.order-history-table tbody tr\.output-results-row-amendment\s*\{/);
  assert.match(stylesSource, /\.status-amendment\s*\{/);
  assert.match(stylesSource, /\.history-status\s*\{[\s\S]*width: 190px;[\s\S]*white-space: nowrap;/);
});
