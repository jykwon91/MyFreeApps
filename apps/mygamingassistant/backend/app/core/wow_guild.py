"""WoW Forever guilds: Blizzard paths and the roster-refresh schedule.

A guild is stored the first time a member is looked up on "Your character".
The scheduler then refreshes its roster, and every member's character, while
someone keeps looking at the guild (``GUILD_TRACKED_FOR``).
"""
from __future__ import annotations

import re
from datetime import timedelta
from typing import Final

# GET /data/wow/guild/{slug} and /data/wow/guild/{slug}/roster, in CHARACTER_NAMESPACE.
GUILD_PATH: Final = "/data/wow/guild"

# A guild slug as Blizzard sends it (it goes into the URL path, so nothing else is accepted).
GUILD_SLUG_PATTERN: Final = re.compile(r"^[^\W_][^\W_-]*(?:-[^\W_-]+)*$")
GUILD_SLUG_MAX_LENGTH: Final = 60
GUILD_NAME_MAX_LENGTH: Final = 60

# Blizzard's faction types, as stored in ``wow_guild.faction``.
GUILD_FACTIONS: Final = frozenset({"ALLIANCE", "HORDE"})

# How often the scheduler looks for guilds whose roster is due.
GUILD_ROSTER_JOB_INTERVAL: Final = timedelta(minutes=30)
# A roster (and its members' sheets) is refreshed when older than this.
GUILD_ROSTER_STALE_AFTER: Final = timedelta(hours=6)
# A guild nobody has looked at for this long stops being refreshed.
GUILD_TRACKED_FOR: Final = timedelta(days=14)
# At most this many guilds per run, oldest roster first; the rest wait for the next run.
GUILD_ROSTER_MAX_GUILDS_PER_RUN: Final = 5
# At most this many members fetched from Blizzard per run, across its guilds. A
# member fetch is about 11 Blizzard calls and the client's hourly quota is
# shared with the AH price refresh and every page look-up: 200 a run (two runs
# an hour) is about 4,400 calls an hour. A bigger guild is finished over its
# next refreshes, since members refreshed within GUILD_ROSTER_STALE_AFTER are
# not fetched again.
GUILD_ROSTER_MAX_MEMBER_FETCHES_PER_RUN: Final = 200
# Roster ranks outside 0..this are dropped (Classic guilds have ranks 0-9).
GUILD_RANK_MAX: Final = 99
# Blizzard 404'd the guild once; a second 404 in a row marks it gone.
GUILD_NOT_FOUND_ERROR: Final = "Blizzard has no guild by that name"
# Members fetched from Blizzard at once while refreshing a roster.
GUILD_MEMBER_FETCH_CONCURRENCY: Final = 4
