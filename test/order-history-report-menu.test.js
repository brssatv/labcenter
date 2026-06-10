const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getOrderHistoryReportMenuLabel,
  getOrderHistoryReportMenuActions,
  createOrderHistoryReportMenuModel,
} = require("../assets/order-history-report-menu.js");

test("report menu label stays aligned with the trigger", () => {
  assert.equal(getOrderHistoryReportMenuLabel(), "Generate Report");
});

test("report menu exposes generate, summary, and final actions", () => {
  assert.deepEqual(getOrderHistoryReportMenuActions(), [
    {
      key: "generate-report",
      label: "Generate Report",
      busyLabel: "Generating Report...",
      tone: "generate",
    },
    {
      key: "generate-summary-report",
      label: "Summary Report",
      busyLabel: "Generating Summary...",
      tone: "summary",
    },
    {
      key: "generate-final-report",
      label: "Final Report",
      busyLabel: "Generating Final...",
      tone: "final",
    },
  ]);
});

test("report menu returns unavailable state when no processed report exists", () => {
  const model = createOrderHistoryReportMenuModel({
    orderId: "42",
    hasProcessedReport: false,
    isOpen: true,
  });

  assert.equal(model.available, false);
  assert.equal(model.triggerLabel, "Generate Report");
  assert.equal(model.actions.length, 0);
});

test("report menu marks only the active action as busy", () => {
  const model = createOrderHistoryReportMenuModel({
    orderId: "42",
    hasProcessedReport: true,
    isGeneratingSummary: true,
    isOpen: true,
  });

  assert.equal(model.available, true);
  assert.equal(model.triggerState, "busy");
  assert.deepEqual(
    model.actions.map((action) => ({
      key: action.key,
      disabled: action.disabled,
      label: action.label,
    })),
    [
      { key: "generate-report", disabled: false, label: "Generate Report" },
      { key: "generate-summary-report", disabled: true, label: "Generating Summary..." },
      { key: "generate-final-report", disabled: false, label: "Final Report" },
    ]
  );
});
