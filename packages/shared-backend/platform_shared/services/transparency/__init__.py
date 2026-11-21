"""Platform-wide cost-transparency feature (shared across all apps).

A single PUBLIC ``/support`` page on every MyFreeApps app shows this
month's platform server costs vs donations received, with a break-even
bar. The backing data lives in a shared MinIO bucket: one JSON object for
costs (``report.json``) plus one small object per Ko-fi donation.

- ONE app (``transparency_primary``) WRITES them — it receives the Ko-fi
  donation webhook and runs the daily Anthropic cost poll.
- EVERY app READS them via the public ``GET /transparency`` endpoint.

This package holds the shared, app-agnostic pieces:

- ``transparency_store`` — read/write the shared object; project the
  current month into the public response shape.
- ``donation_store`` — one object per donation, keyed by month and
  ``message_id``; month totals, pruning, and the move out of ``report.json``.
- ``kofi_service`` — verify + parse Ko-fi donation webhooks (static
  ``verification_token``, dedup on ``message_id``).
- ``anthropic_cost_service`` — pull the org's month-to-date spend from
  the Anthropic Admin Cost Report API.
- ``cost_sync`` — orchestrate the poll: fetch spend, recompute costs,
  persist.
- ``scheduler`` — when the daily cost sync is due + a never-raising run-once,
  driven by the primary app's single scheduler worker (gated by
  ``transparency_primary``).
"""
