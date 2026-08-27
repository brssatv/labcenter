const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("requisition UI is loaded from dedicated feature files before app bootstrap", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const dobPickerIndex = html.indexOf("/assets/dob-picker.js");
  const listIndex = html.indexOf("/assets/requisition-list.js");
  const actionsIndex = html.indexOf("/assets/requisition-actions.js");
  const formIndex = html.indexOf("/assets/requisition-form.js");
  const appIndex = html.indexOf("app.js?");
  assert.ok(dobPickerIndex >= 0);
  assert.ok(actionsIndex >= 0);
  assert.ok(listIndex > actionsIndex);
  assert.ok(formIndex > listIndex);
  assert.ok(appIndex > formIndex);
});

test("requisition DOB uses the guided range year month and day selector", () => {
  const formSource = fs.readFileSync(path.join(root, "assets", "requisition-form.js"), "utf8");
  const pickerSource = fs.readFileSync(path.join(root, "assets", "dob-picker.js"), "utf8");
  assert.match(formSource, /id="patient-dob-display"/);
  assert.match(formSource, /id="patient-dob-trigger"/);
  assert.match(formSource, /id="patient-dob-progress"/);
  assert.match(formSource, /Range → year → month → day/);
  assert.match(formSource, /patient-demographics-grid/);
  assert.match(formSource, /patient-age-field/);
  assert.match(formSource, /LabCenterDobPicker\?\.createDobPicker/);
  assert.match(formSource, /dob-picker-back is-placeholder/);
  assert.match(pickerSource, /classList\.toggle\("is-placeholder", isFirstStep\)/);
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

test("requisition creation uses stable submission IDs and single-flight click guards", () => {
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const formSource = fs.readFileSync(path.join(root, "assets", "requisition-form.js"), "utf8");

  assert.match(appSource, /function createSubmissionId\s*\(/);
  assert.match(appSource, /submissionId, orders: nextRecords/);
  assert.match(appSource, /if \(orderSubmitInFlight\) return;/);
  assert.match(appSource, /saveOrderRecords\(nextOrderRecords, \{ submissionId: orderSubmissionId \}\)/);
  assert.match(formSource, /if \(registrationSubmitInFlight\) return;/);
  assert.match(formSource, /saveRegistrationData\(data, \{ submissionId: registrationSubmissionId \}\)/);
});
