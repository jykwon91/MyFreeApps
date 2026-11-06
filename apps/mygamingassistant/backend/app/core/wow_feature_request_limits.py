"""Fixed limits for WoW Forever feature requests — lengths, caps, retention.

Operator-tunable values (daily cap, per-IP rates, model, triage token) live in
``app/core/config.py``; these are part of the contract (DB CHECKs, schema
validation, the runbook) and change only with a migration or a PR.
"""

# --- Story text (DB column lengths + schema / mapper caps) -------------------
TITLE_MAX = 80
PERSONA_MAX = 120
I_WANT_MAX = 300
SO_THAT_MAX = 300
CRITERION_MAX = 200
CRITERIA_MAX_ITEMS = 6
FOLLOW_UP_MAX = 200
FOLLOW_UPS_MAX_ITEMS = 4
TOPIC_MAX = 30
FEASIBILITY_NOTE_MAX = 300
OPERATOR_NOTE_MAX = 1000
SHIPPED_PATH_MAX = 200
PRIORITY_MIN = 1
PRIORITY_MAX = 3

# --- Submission text ----------------------------------------------------------
RAW_TEXT_MIN = 10
RAW_TEXT_MAX = 1000
CLARIFICATION_ANSWER_MAX = 500
NUANCE_NOTE_MAX = 300
REASON_MAX = 200
MODEL_ID_MAX = 80
CONTEXT_MAX_PROFESSIONS = 12
CONTEXT_MAX_ACTIVITIES = 8

# Shown in place of a story field Claude returned unusable, so the request
# still reaches triage instead of failing the submitter.
FALLBACK_PERSONA = "a player"
FALLBACK_TITLE = "Feature request"
FALLBACK_STORY_TEXT = "(to be written during review)"
# Asked when Claude chose needs_clarification but wrote no usable question.
FALLBACK_QUESTION = "Could you tell us a little more about what you would like the page to show?"

# --- Public board ---------------------------------------------------------------
BOARD_DEFAULT_LIMIT = 20
BOARD_MAX_LIMIT = 50

# --- Refinement (Claude) --------------------------------------------------------
REFINER_MAX_TOKENS = 1000
REFINER_TIMEOUT_SECONDS = 60.0
# Public stories sent to Claude as dedupe candidates, and how much of each.
DEDUPE_CANDIDATES_MAX = 200
# Candidates are S1..Sn in the prompt; public text that names one is dropped.
CANDIDATE_ID_PREFIX = "S"
DEDUPE_CANDIDATE_TEXT_CHARS = 200
DAILY_CAP_BUCKET = "wow-feature-refine"

# --- Abuse / volume guards ------------------------------------------------------
# Untriaged submissions above this answer 503 feature_inbox_full until triage
# catches up — bounds what an anonymous flood can pile up.
MAX_UNTRIAGED_SUBMISSIONS = 500
# A resubmission of the same text within this window reuses the earlier
# story (no Claude call, no quota).
FINGERPRINT_REUSE_DAYS = 30
# Votes one network (IP, IPv6 /64) can cast on one story.
MAX_VOTES_PER_IP_PER_STORY = 3
IPV6_VOTE_PREFIX = 64

# --- Triage API -----------------------------------------------------------------
TRIAGE_TOKEN_HEADER = "X-MGA-Triage-Token"
TRIAGE_TOKEN_MIN_LENGTH = 32
TRIAGE_TOKEN_MIN_DISTINCT_CHARS = 16
TRIAGE_LABEL_PATTERN = r"^[a-z0-9_-]{1,20}$"
# Label of a token configured without "label:" in front.
TRIAGE_DEFAULT_LABEL = "default"
# A wrong/missing token answers 404 like an unknown route; after this many
# failures per IP per window the IP gets 429.
TRIAGE_FAILED_AUTH_MAX = 10
TRIAGE_FAILED_AUTH_WINDOW_SECONDS = 15 * 60
# Authenticated triage requests per IP per minute.
TRIAGE_RATE_LIMIT_PER_MINUTE = 240
TRIAGE_PATH_PREFIX = "/wow/feature-requests/triage"
TRIAGE_INBOX_MAX = 200
TRIAGE_MARK_MAX_IDS = 500
# audit_logs.changed_by for triage writes is "triage:<label>".
TRIAGE_AUDIT_ACTOR_PREFIX = "triage:"
# Exactly what Starlette answers for an unknown route, so a wrong token and
# an unmounted triage router look the same to a stranger.
NOT_FOUND_DETAIL = "Not Found"

# --- Retention --------------------------------------------------------------------
UNLINKED_SUBMISSION_RETENTION_DAYS = 14
LINKED_RAW_TEXT_RETENTION_DAYS = 180
IP_HASH_RETENTION_DAYS = 30
PURGE_INTERVAL_HOURS = 24

# --- Machine-readable error details (the frontend maps these to copy) -----------
DETAIL_UNAVAILABLE = "feature_requests_unavailable"
DETAIL_INBOX_FULL = "feature_inbox_full"
DETAIL_DAILY_LIMIT = "feature_requests_daily_limit_reached"
DETAIL_REFINER_BUSY = "feature_refiner_busy"
DETAIL_REFINER_FAILED = "feature_refiner_unavailable"
DETAIL_NOT_FOUND = "feature_request_not_found"
DETAIL_ALREADY_ANSWERED = "clarification_already_answered"
DETAIL_NOT_VOTABLE = "story_not_votable"
DETAIL_VOTE_LIMIT = "vote_limit_reached"
DETAIL_MERGE_CONFLICT = "merge_conflict"
DETAIL_STATUS_CONFLICT = "status_conflict"
DETAIL_STORY_CHANGED = "story_changed"
DETAIL_IF_MATCH_REQUIRED = "if_match_required"
DETAIL_IF_MATCH_INVALID = "invalid_if_match"
