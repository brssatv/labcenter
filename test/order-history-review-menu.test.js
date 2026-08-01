const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getOrderHistoryReviewMenuLabel,
  getOrderHistoryReviewMenuActions,
  createOrderHistoryReviewMenuModel,
} = require("../assets/order-history-review-menu.js");

test("review menu label stays aligned with the combined action trigger", () => {
  assert.equal(getOrderHistoryReviewMenuLabel(), "Review Result");
});

test("review menu exposes validate, transcribe, and reject actions", () => {
  assert.deepEqual(getOrderHistoryReviewMenuActions(), [
    {
      key: "validate",
      label: "Validate",
      disabledLabel: "Validate (Requires Report)",
      tone: "validate",
    },
    {
      key: "transcribe",
      label: "Transcribe",
      tone: "transcribe",
    },
    {
      key: "reject",
      label: "Reject Order",
      tone: "reject",
    },
  ]);
});

test("review menu promotes transcribe when no processed report exists", () => {
  const model = createOrderHistoryReviewMenuModel({
    orderId: "42",
    hasProcessedReport: false,
    isOpen: true,
  });

  assert.equal(model.available, true);
  assert.equal(model.primaryAction.key, "transcribe");
  assert.equal(model.primaryAction.label, "Transcribe");
  assert.equal(model.triggerTone, "transcribe");
  assert.deepEqual(
    model.actions.map((action) => ({
      key: action.key,
      disabled: action.disabled,
      label: action.label,
    })),
    [
      { key: "transcribe", disabled: false, label: "Transcribe" },
      { key: "validate", disabled: true, label: "Validate (Requires Report)" },
      { key: "reject", disabled: false, label: "Reject Order" },
    ]
  );
});

test("review menu promotes validate and keeps transcribe available once a report exists", () => {
  const model = createOrderHistoryReviewMenuModel({
    orderId: "42",
    hasProcessedReport: true,
    isOpen: false,
  });

  assert.equal(model.available, true);
  assert.equal(model.primaryAction.key, "validate");
  assert.equal(model.primaryAction.label, "Validate");
  assert.equal(model.triggerTone, "validate");
  assert.deepEqual(
    model.actions.map((action) => ({
      key: action.key,
      disabled: action.disabled,
      label: action.label,
    })),
    [
      { key: "validate", disabled: false, label: "Validate" },
      { key: "transcribe", disabled: false, label: "Transcribe" },
      { key: "reject", disabled: false, label: "Reject Order" },
    ]
  );
});
