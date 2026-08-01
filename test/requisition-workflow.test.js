const test = require("node:test");
const assert = require("node:assert/strict");

const workflow = require("../assets/requisition-workflow.js");

test("requisition workflow permits rejection only for eligible orders", () => {
  assert.equal(workflow.canRejectOrder({ status: "Pending" }), true);
  assert.equal(workflow.canRejectOrder({ status: "Rejected" }), false);
  assert.equal(workflow.canRejectOrder({ status: "Complete" }), false);
  assert.equal(workflow.canRejectOrder({ status: "Pending", publishedReports: { final: { publishedAt: "2026-07-31T12:00:00Z" } } }), false);
});

test("requisition workflow rejection patch preserves the prior status", () => {
  assert.deepEqual(
    workflow.createRejectionPatch(
      { status: "Processed" },
      { at: "2026-07-31T12:00:00Z", actor: "clinician@example.com", reason: "Invalid specimen" }
    ),
    {
      statusBeforeRejection: "Processed",
      status: "Rejected",
      rejectedAt: "2026-07-31T12:00:00Z",
      rejectedBy: "clinician@example.com",
      rejectionReason: "Invalid specimen",
      updatedAt: "2026-07-31T12:00:00Z",
    }
  );
});

test("requisition workflow undo patch restores the saved status", () => {
  assert.deepEqual(
    workflow.createUndoRejectionPatch(
      { status: "Rejected", statusBeforeRejection: "Processed" },
      { at: "2026-07-31T12:15:00Z", actor: "clinician@example.com" }
    ),
    {
      status: "Processed",
      rejectionUndoneAt: "2026-07-31T12:15:00Z",
      rejectionUndoneBy: "clinician@example.com",
      updatedAt: "2026-07-31T12:15:00Z",
    }
  );
});

test("requisition workflow merges stored and legacy audit events without duplicates", () => {
  const createdAt = "2026-07-31T12:00:00Z";
  const rows = workflow.mergeAuditEvents(
    [{ eventType: "order_created", eventAt: createdAt, actor: "admin@example.com" }],
    { createdAt, rejectedAt: "2026-07-31T13:00:00Z", rejectionReason: "Invalid specimen" }
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].eventType, "order_rejected");
  assert.equal(rows[1].eventType, "order_created");
});
