# Release notes

## 2026-08-05 — PrePublish result synchronization

### Before

- Saving approved transcription or validation changes updated the order result only.
- PrePublish regenerated the final-report PDF, but a previously stored PharmD ORU could remain unchanged.
- An earlier sent or received state could remain visible after a revised result was prepublished.

### After

- PrePublish generates the final-report PDF and a fresh ORU from the same latest saved result.
- The refreshed ORU replaces the previous stored message and receives a new timestamp and message-control ID.
- A successful PrePublish resets the active PharmD delivery cycle to `ready`, making **Send to PharmD** the next action even when an earlier revision was sent or received.
- Prior delivery logs remain available for audit history, while stale active send and receipt fields are cleared.
- Final-report and ORU hashes are stored for revision traceability, and the server validates the submitted ORU before publishing.

### Validation

- Full automated suite: 131 tests passed.
- JavaScript syntax and Git whitespace checks passed.
