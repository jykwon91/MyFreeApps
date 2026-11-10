"""Building blocks for long-running worker processes (scheduler services).

An app's worker owns its boot checks and its tick; these modules own the
parts every such worker shares: the heartbeat file its container healthcheck
reads, the tick loop that advances it, and the process entrypoint.
"""
