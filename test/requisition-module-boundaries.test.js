const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("requisition UI is loaded from dedicated feature files before app bootstrap", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const listIndex = html.indexOf("/assets/requisition-list.js");
  const actionsIndex = html.indexOf("/assets/requisition-actions.js");
  const formIndex = html.indexOf("/assets/requisition-form.js");
  const appIndex = html.indexOf("app.js?");
  assert.ok(actionsIndex >= 0);
  assert.ok(listIndex > actionsIndex);
  assert.ok(formIndex > listIndex);
  assert.ok(appIndex > formIndex);
});

test("requisition page implementations no longer live in the app bootstrap file", () => {
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const listSource = fs.readFileSync(path.join(root, "assets", "requisition-list.js"), "utf8");
  const formSource = fs.readFileSync(path.join(root, "assets", "requisition-form.js"), "utf8");
  assert.doesNotMatch(appSource, /function renderRequisitionList\s*\(/);
  assert.doesNotMatch(appSource, /function renderRegistration\s*\(/);
  assert.doesNotMatch(appSource, /function rejectOrderWithConfirmation\s*\(/);
  assert.doesNotMatch(appSource, /function requestRequisitionScanAutofill\s*\(/);
  assert.match(listSource, /function renderRequisitionList\s*\(/);
  assert.match(formSource, /function renderRegistration\s*\(/);
});
