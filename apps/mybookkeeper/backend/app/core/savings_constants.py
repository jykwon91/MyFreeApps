"""Limits and model settings for the savings research job."""

# The research call. Opus at high effort: the job reads the person's whole
# money picture and weighs offers against it, once a day, so depth is worth
# the cost. Search and fetch budgets cap what one run can spend on tools.
RESEARCH_MODEL = "claude-opus-5-5"
RESEARCH_EFFORT = "high"
RESEARCH_MAX_TOKENS = 32000
RESEARCH_MAX_SEARCHES = 15
RESEARCH_MAX_FETCHES = 10
# A research turn streams for minutes; the HTTP read timeout must outlast it.
RESEARCH_TIMEOUT_SECONDS = 900.0
# The most one run may sleep waiting out an Anthropic rate limit before it
# gives up and is recorded as rate limited.
RESEARCH_MAX_RATE_LIMIT_WAIT_SECONDS = 600.0

# How often the scheduler researches for someone who has it on, measured from
# the start of their last run (scheduled or by hand).
RESEARCH_INTERVAL_HOURS = 24

# "Research now" runs a person may start in any rolling 24 hours.
MANUAL_RUNS_PER_DAY = 3
MANUAL_RUN_WINDOW_HOURS = 24

# A run still marked running this long after it started was cut off (the
# process restarted mid-run); it is closed as interrupted so a new one can start.
STALE_RUN_MINUTES = 45

# An open idea drops off the list when no run has re-confirmed it for this long.
IDEA_STALE_DAYS = 7

# Every value the reply can carry is capped before it reaches the database.
IDEA_KEY_MAX_LENGTH = 160
IDEA_TITLE_MAX_LENGTH = 200
IDEA_SUBJECT_MAX_LENGTH = 120
IDEA_MAX_STEPS = 10
IDEA_STEP_MAX_LENGTH = 500
IDEA_WHY_MAX_LENGTH = 1500
IDEA_MAX_SOURCES = 8
IDEA_SOURCE_URL_MAX_LENGTH = 2000
IDEAS_PER_RUN_MAX = 25
CARD_TEXT_MAX_LENGTH = 300
# No single idea plausibly saves more than this a year; a larger figure is a
# misread (cents for dollars, a lifetime total) and is clamped, never stored.
IDEA_SAVINGS_MAX_CENTS = 10_000_000

# The spending summary sent to the model.
SUMMARY_LOOKBACK_DAYS = 365
SUMMARY_TOP_CATEGORIES = 25
SUMMARY_TOP_RECURRING = 30
SUMMARY_MERCHANT_MAX_LENGTH = 60
# Earlier ideas listed so the model reuses their subjects (newest first).
SUMMARY_KNOWN_IDEAS_MAX = 60
# A merchant is recurring when it charged at least this many times, at a
# steady gap that matches one of the cadences below.
RECURRING_MIN_CHARGES = 3
RECURRING_ANNUAL_MIN_CHARGES = 2
# (cadence name, smallest gap in days, largest gap in days, charges per year)
RECURRING_CADENCES: tuple[tuple[str, int, int, int], ...] = (
    ("weekly", 6, 8, 52),
    ("monthly", 26, 35, 12),
    ("quarterly", 85, 97, 4),
    ("annual", 350, 380, 1),
)
# How far a charge may stray from the merchant's median amount and still
# count as the same subscription (a price rise, tax, a partial month).
RECURRING_AMOUNT_TOLERANCE = 0.35
