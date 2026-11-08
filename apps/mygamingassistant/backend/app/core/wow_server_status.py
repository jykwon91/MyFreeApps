"""Server status constants for the WoW Forever companion.

The live status (``app/services/wow/server_status_client.py``) and the history
recorder (``app/services/wow/server_status/``) share these. Regions and
statuses each need a CHECK value here AND in the migration that adds them.
"""
from datetime import timedelta
from typing import Final, Literal, get_args

ServerStatusRegion = Literal["us", "eu", "kr", "tw"]
SERVER_STATUS_REGIONS: Final[tuple[str, ...]] = get_args(ServerStatusRegion)

STATUS_UP: Final = "up"
STATUS_DOWN: Final = "down"
ServerStatusValue = Literal["up", "down"]
SERVER_STATUS_VALUES: Final[tuple[str, ...]] = get_args(ServerStatusValue)

# Rulesets in display order; Blizzard may add more, which sort after these.
RULESET_ORDER: Final = ("normal", "pvp", "roleplay", "roleplay-pvp")
RULESET_NAMES: Final[dict[str, str]] = {
    "normal": "Normal",
    "pvp": "PvP",
    "roleplay": "Roleplay",
    "roleplay-pvp": "Roleplay PvP",
}

# How often the scheduler asks Blizzard and records what changed.
RECORD_INTERVAL: Final = timedelta(minutes=5)
# With no change, one row per ruleset this often — proof the recorder was
# running, so a quiet stretch reads "up" rather than "no data".
CHECKPOINT_INTERVAL: Final = timedelta(hours=1)
# A stored status counts for this long after its row; past it the history
# shows "no data" (the recorder was down or Blizzard couldn't be reached).
MAX_SAMPLE_GAP: Final = CHECKPOINT_INTERVAL + 2 * RECORD_INTERVAL
# Rows older than this are deleted by the daily purge.
HISTORY_RETENTION: Final = timedelta(days=90)
# What GET /wow/server-status/history returns.
HISTORY_WINDOW: Final = timedelta(days=7)
PURGE_INTERVAL_HOURS: Final = 24
