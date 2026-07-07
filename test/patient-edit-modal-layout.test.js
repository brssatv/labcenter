const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

function extractPatientEditModalMarkup() {
  const start = appSource.indexOf('<div id="patient-edit-modal"');
  const end = appSource.indexOf('const patientEditModalNode = document.getElementById("patient-edit-modal");');
  assert.notEqual(start, -1, "patient edit modal markup should exist");
  assert.notEqual(end, -1, "patient edit modal setup should exist");
  return appSource.slice(start, end);
}

function extractCssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesSource.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `${selector} CSS rule should exist`);
  return match[1];
}

test("patient edit modal keeps form content in a dedicated scroll pane", () => {
  const markup = extractPatientEditModalMarkup();
  const scrollIndex = markup.indexOf('class="patient-edit-scroll"');
  const feedbackIndex = markup.indexOf('id="patient-edit-feedback"');
  const footerIndex = markup.indexOf('class="custom-icd-footer patient-edit-footer"');
  const scrollCloseIndex = markup.indexOf("</div>", markup.lastIndexOf("</section>", feedbackIndex));

  assert.notEqual(scrollIndex, -1, "scroll pane should wrap edit sections");
  assert.notEqual(feedbackIndex, -1, "feedback line should remain available");
  assert.notEqual(footerIndex, -1, "footer should remain available");
  assert.ok(scrollIndex < feedbackIndex, "scroll pane should be before feedback and footer");
  assert.ok(scrollCloseIndex < feedbackIndex, "scroll pane should close before feedback");
  assert.ok(feedbackIndex < footerIndex, "feedback should appear above footer");
});

test("patient edit modal footer is docked instead of overlaying scroll content", () => {
  const bodyRule = extractCssRule(".patient-edit-body");
  const scrollRule = extractCssRule(".patient-edit-scroll");
  const footerRule = extractCssRule(".patient-edit-footer");

  assert.match(bodyRule, /grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto\s+auto/);
  assert.match(bodyRule, /overflow:\s*hidden/);
  assert.match(scrollRule, /overflow-y:\s*auto/);
  assert.doesNotMatch(footerRule, /position:\s*sticky/);
  assert.doesNotMatch(footerRule, /bottom:\s*0/);
  assert.doesNotMatch(footerRule, /margin:[^;]*-\d/);
});

test("patient edit modal sizing and grids are scoped to patient edit classes", () => {
  assert.ok(stylesSource.includes(".custom-icd-dialog.patient-edit-dialog"));
  assert.ok(stylesSource.includes(".patient-edit-section .field-grid"));
  assert.ok(stylesSource.includes(".patient-edit-section .field-grid.three-col"));
  assert.ok(stylesSource.includes(".patient-edit-section .field-grid.four-col"));
});
