const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isAdvanceEligibleField,
  findNextAdvanceField,
  focusNextAdvanceField,
} = require("../assets/requisition-form-navigation.js");

function createMockField({
  tagName = "INPUT",
  type = "text",
  hidden = false,
  disabled = false,
  readOnly = false,
  visible = true,
} = {}) {
  return {
    tagName,
    type,
    disabled,
    readOnly,
    focusCalls: 0,
    selectCalls: 0,
    closest(selector) {
      return hidden && selector === ".hidden" ? { hidden: true } : null;
    },
    getClientRects() {
      return { length: visible ? 1 : 0 };
    },
    focus() {
      this.focusCalls += 1;
    },
    select() {
      this.selectCalls += 1;
    },
  };
}

test("isAdvanceEligibleField accepts visible text inputs and selects", () => {
  assert.equal(isAdvanceEligibleField(createMockField()), true);
  assert.equal(isAdvanceEligibleField(createMockField({ tagName: "SELECT" })), true);
});

test("isAdvanceEligibleField rejects blocked, hidden, disabled, and read-only controls", () => {
  assert.equal(isAdvanceEligibleField(createMockField({ type: "checkbox" })), false);
  assert.equal(isAdvanceEligibleField(createMockField({ tagName: "TEXTAREA" })), false);
  assert.equal(isAdvanceEligibleField(createMockField({ hidden: true })), false);
  assert.equal(isAdvanceEligibleField(createMockField({ visible: false })), false);
  assert.equal(isAdvanceEligibleField(createMockField({ disabled: true })), false);
  assert.equal(isAdvanceEligibleField(createMockField({ readOnly: true })), false);
});

test("findNextAdvanceField honors a preferred next field and skips excluded or ineligible entries", () => {
  const facility = createMockField();
  const provider = createMockField();
  const providerNpi = createMockField({ readOnly: true });
  const customAllergy = createMockField();
  const firstName = createMockField();

  const fields = [facility, provider, providerNpi, customAllergy, firstName];

  assert.equal(
    findNextAdvanceField(fields, facility, {
      preferredNextField: provider,
      excludedElements: [customAllergy],
    }),
    provider
  );
  assert.equal(
    findNextAdvanceField(fields, provider, {
      excludedElements: [customAllergy],
    }),
    firstName
  );
});

test("focusNextAdvanceField focuses and selects the next editable field", () => {
  const provider = createMockField();
  const firstName = createMockField();
  const dob = createMockField({ type: "date" });

  assert.equal(focusNextAdvanceField([provider, firstName, dob], provider), true);
  assert.equal(firstName.focusCalls, 1);
  assert.equal(firstName.selectCalls, 1);

  assert.equal(focusNextAdvanceField([firstName, dob], firstName), true);
  assert.equal(dob.focusCalls, 1);
  assert.equal(dob.selectCalls, 0);
});

test("focusNextAdvanceField returns false when there is no next editable field", () => {
  const lastField = createMockField();
  assert.equal(focusNextAdvanceField([lastField], lastField), false);
});
