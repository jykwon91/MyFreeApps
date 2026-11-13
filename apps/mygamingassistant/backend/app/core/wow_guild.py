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
# How often a watched guild's roster and its members' sheets are refreshed.
GUILD_ROSTER_REFRESH_EVERY: Final = timedelta(hours=1)
# A roster, or a member, refreshed before this long ago is due. Half a job
# interval short of the hour: runs are a job interval apart, so one falls an
# hour after the last, and a member is fetched a little after its run starts —
# a full hour would still count last hour's run as fresh and push the refresh to
# every 90 minutes (members to 2 hours). A roster is stamped with its run's
# start, so only a member fetched more than half an interval into a run waits
# an extra run.
GUILD_ROSTER_STALE_AFTER: Final = GUILD_ROSTER_REFRESH_EVERY - GUILD_ROSTER_JOB_INTERVAL / 2
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

# The gains boards count from each member's newest stored day at or before this
# many days ago (else their earliest stored day) up to their newest one.
GUILD_GAINS_WINDOW_DAYS: Final = 7

# GET /wow/guilds/{slug}/reputations?faction=: a faction id is a positive INT.
FACTION_ID_MAX: Final = 2_147_483_647

# GET /wow/guilds/{slug}: per-IP look-ups per window (a database read, no Blizzard call).
GUILD_RATE_LIMIT: Final = 60
GUILD_RATE_WINDOW_SECONDS: Final = 60

# GET /wow/guilds/{slug}/recipes?q=: who in the guild knows a recipe.
GUILD_RECIPE_QUERY_MIN_LENGTH: Final = 2
GUILD_RECIPE_QUERY_MAX_LENGTH: Final = 60
# GET /wow/guilds?q=: find a stored guild by part of its name.
GUILD_SEARCH_QUERY_MIN_LENGTH: Final = 2
GUILD_SEARCH_QUERY_MAX_LENGTH: Final = GUILD_NAME_MAX_LENGTH
# Guilds per answer; more matches = ``truncated`` (type more of the name).
GUILD_SEARCH_RESULT_LIMIT: Final = 20

# Control characters are never in a recipe or guild name, and Postgres refuses NUL in text.
GUILD_QUERY_FORBIDDEN: Final = re.compile(r"[\x00-\x1f\x7f]")
# Recipes per answer; more matches = ``truncated`` (type more of the name).
GUILD_RECIPE_RESULT_LIMIT: Final = 20
# Professions whose "recipes" are just the skill itself (gathering, Fishing):
# Herbalism, Mining, Skinning, Fishing. Never searched.
GUILD_RECIPE_EXCLUDED_PROFESSION_IDS: Final = frozenset({182, 186, 393, 356})
