"""Allowed values for WoW Forever feature requests — one list per enum.

Backend columns are ``String(N)`` + CHECK constraints built from these tuples
(migration 0049 holds frozen copies). The frontend keeps the same lists as
TypeScript unions; ``tests/test_wow_feature_request_enums.py`` pins them, and
the class ids are checked against ``frontend/src/games/wow-forever/data/classes.ts``.
Change both sides together.
"""

# --- story.status ------------------------------------------------------------
# ``submitted`` (new, awaiting review) and ``duplicate`` (merged into another
# story) are PRIVATE: never on the public board, never returned by a public read.
STORY_STATUSES: tuple[str, ...] = (
    "submitted",
    "open",
    "planned",
    "in_progress",
    "shipped",
    "not_planned",
    "duplicate",
)
PUBLIC_STORY_STATUSES: tuple[str, ...] = (
    "open",
    "planned",
    "in_progress",
    "shipped",
    "not_planned",
)
# The board's default filter, and the only statuses that take votes.
ACTIVE_STORY_STATUSES: tuple[str, ...] = ("open", "planned", "in_progress")
STATUS_SUBMITTED = "submitted"
STATUS_OPEN = "open"
STATUS_SHIPPED = "shipped"
STATUS_DUPLICATE = "duplicate"

# --- story.area / story.feasibility ------------------------------------------
STORY_AREAS: tuple[str, ...] = (
    "map_travel",
    "leveling_quests",
    "professions",
    "food_consumables",
    "gold_economy",
    "gear_upgrades",
    "class_guides",
    "dungeons_raids",
    "pvp",
    "site_app",
)
# Where a story lands when Claude's area is unusable — triage moves it.
FALLBACK_AREA = "site_app"

FEASIBILITIES: tuple[str, ...] = ("feasible", "needs_data", "not_possible")
FALLBACK_FEASIBILITY = "feasible"

# --- submission.verdict ------------------------------------------------------
VERDICT_NEW = "new"
VERDICT_DUPLICATE = "duplicate"
VERDICT_NEEDS_CLARIFICATION = "needs_clarification"
VERDICT_REJECTED = "rejected"
VERDICTS: tuple[str, ...] = (
    VERDICT_NEW,
    VERDICT_DUPLICATE,
    VERDICT_NEEDS_CLARIFICATION,
    VERDICT_REJECTED,
)
# Verdicts whose submission is linked to a story (CHECK in the migration).
STORY_LINKED_VERDICTS: tuple[str, ...] = (VERDICT_NEW, VERDICT_DUPLICATE)

# --- vote.source -------------------------------------------------------------
VOTE_SOURCE_VOTE = "vote"
VOTE_SOURCE_SUBMISSION = "submission"
VOTE_SOURCES: tuple[str, ...] = (VOTE_SOURCE_VOTE, VOTE_SOURCE_SUBMISSION)

# --- "About you" context (all optional) --------------------------------------
# Class ids match frontend data/classes.ts (WowClassId) plus "undecided".
CONTEXT_CLASSES: tuple[str, ...] = (
    "druid",
    "hunter",
    "mage",
    "paladin",
    "priest",
    "rogue",
    "shaman",
    "warlock",
    "warrior",
    "undecided",
)
CONTEXT_EXPERIENCES: tuple[str, ...] = ("new", "returning", "veteran")
CONTEXT_LEVEL_BANDS: tuple[str, ...] = (
    "1-10",
    "11-20",
    "21-30",
    "31-40",
    "41-50",
    "51-59",
    "60-fresh",
    "60-raiding",
    "not-playing",
)
CONTEXT_PROFESSIONS: tuple[str, ...] = (
    "alchemy",
    "blacksmithing",
    "enchanting",
    "engineering",
    "herbalism",
    "leatherworking",
    "mining",
    "skinning",
    "tailoring",
    "cooking",
    "fishing",
    "first_aid",
)
CONTEXT_ACTIVITIES: tuple[str, ...] = (
    "leveling_solo",
    "leveling_group",
    "dungeons",
    "raiding",
    "pvp",
    "gathering_gold",
    "crafting",
    "casual",
)
CONTEXT_FACTIONS: tuple[str, ...] = ("alliance", "horde", "undecided")

# --- Public board query ------------------------------------------------------
SORT_TOP = "top"
SORT_NEW = "new"
BOARD_SORTS: tuple[str, ...] = (SORT_TOP, SORT_NEW)
