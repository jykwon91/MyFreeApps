"""Platform-wide cost-transparency feature (shared across all apps).

A single PUBLIC ``/support`` page on every MyFreeApps app shows this
month's platform server costs vs donations received, with a break-even
bar. The backing data is ONE JSON object in a shared MinIO bucket:

- ONE app (``transparency_primary``) WRITES it — it receives the Ko-fi
  donation webhook and runs the daily Anthropic cost poll.
- EVERY app READS it via the public ``GET /transparency`` endpoint.

This package holds the shared, app-agnostic pieces:

- ``transparency_store`` — read/write the shared object; project the
  current month into the public response shape.
- ``kofi_service`` — verify + parse Ko-fi donation webhooks (static
  ``verification_token``, dedup on ``message_id``).
- ``anthropic_cost_service`` — pull the org's month-to-date spend from
  the Anthropic Admin Cost Report API.
- ``cost_sync`` — orchestrate the poll: fetch spend, recompute costs,
  persist.
- ``scheduler`` — the daily asyncio cost-sync loop (started only on the
  primary app, gated by ``transparency_primary``).
"""
