"""MGA-specific Discord bot services.

Builds on platform_shared.services.discord (shared Ed25519 verification,
REST client, interaction constants) with MGA's domain logic:
  - dispatcher  — routes APPLICATION_COMMAND payloads to command handlers
  - commands/   — per-command handler modules (raid, future)
  - commands_spec — slash-command definitions sent to the Discord API

The HTTP endpoint itself lives in app/api/discord_interactions.py.
"""
