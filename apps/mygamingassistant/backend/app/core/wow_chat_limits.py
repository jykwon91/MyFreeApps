"""Fixed limits + error codes for the WoW Forever "Ask" chat relay.

Operator-tunable values (model, max tokens, daily token caps, per-IP rates)
live in ``app/core/config.py``; these are part of the contract with the
browser (``POST /api/wow/chat/turn``) and change only with a PR that updates
the frontend too.
"""

# --- Route ------------------------------------------------------------------------
CHAT_TURN_PATH = "/wow/chat/turn"
# The Turnstile widget action the chat's tokens must carry.
WOW_CHAT_TURNSTILE_ACTION = "wow-chat"
# The whole request body, enforced by ``app/core/body_size_cap.py`` BEFORE JSON parsing.
MAX_BODY_BYTES = 64 * 1024

# --- Conversation shape (validated after parsing; never trimmed silently) ----------
USER_TEXT_MAX_CHARS = 1000
TOOL_RESULT_MAX_BYTES = 4 * 1024
CONVERSATION_MAX_CHARS = 24_000
MESSAGES_MAX = 30
USER_TURNS_MAX = 12
# Tool rounds (continuation calls) allowed after one new user message. The last
# allowed round runs with ``tool_choice: none`` so Claude has to answer in text.
TOOL_ROUNDS_MAX = 3
TOOL_USE_ID_PATTERN = r"^[A-Za-z0-9_-]{1,100}$"
# A tool call Claude makes whose JSON input is longer than this is not relayed.
TOOL_INPUT_MAX_CHARS = 1000

# --- Ticket -------------------------------------------------------------------------
TICKET_VERSION = 1
TICKET_TTL_SECONDS = 15 * 60
TICKET_MAX_CHARS = 1000
IPV6_NETWORK_PREFIX = 64

# --- Claude call -------------------------------------------------------------------
CHAT_TIMEOUT_SECONDS = 45.0
CHAT_MAX_RETRIES = 1
# Upper-bound token estimate for the reservation: ceil(chars / 3) of input.
CHARS_PER_TOKEN_ESTIMATE = 3
# Output tokens cost ~5x input tokens; cache reads ~1/10 of input.
OUTPUT_TOKEN_WEIGHT = 5
CACHE_READ_TOKEN_DIVISOR = 10
# Anthropic's rate-limit windows are per minute.
UPSTREAM_BUSY_RETRY_AFTER_SECONDS = 60

# --- Durable daily buckets (daily_usage_counters) ------------------------------------
GLOBAL_TOKEN_BUCKET = "wow-chat"
IP_TOKEN_BUCKET_PREFIX = "wow-chat-ip:"

# --- Error details (the browser routes on these fixed codes) -------------------------
DETAIL_UNAVAILABLE = "chat_unavailable"
DETAIL_BODY_TOO_LARGE = "chat_body_too_large"
DETAIL_INVALID_JSON = "chat_invalid_json"
DETAIL_INVALID_REQUEST = "chat_invalid_request"
DETAIL_MESSAGE_TOO_LONG = "chat_message_too_long"
DETAIL_TOOL_RESULT_TOO_LARGE = "chat_tool_result_too_large"
DETAIL_CONVERSATION_TOO_LONG = "chat_conversation_too_long"
DETAIL_TOO_MANY_MESSAGES = "chat_too_many_messages"
DETAIL_TOO_MANY_TURNS = "chat_too_many_turns"
DETAIL_BAD_ROLE_ORDER = "chat_bad_role_order"
DETAIL_FIRST_MESSAGE = "chat_first_message_not_user_text"
DETAIL_BAD_USER_CONTENT = "chat_bad_user_content"
DETAIL_BAD_ASSISTANT_CONTENT = "chat_bad_assistant_content"
DETAIL_TOOL_RESULT_REQUIRED = "chat_tool_result_required"
DETAIL_TOOL_RESULT_MISMATCH = "chat_tool_result_mismatch"
DETAIL_TICKET_REQUIRED = "chat_ticket_required"
DETAIL_TICKET_INVALID = "chat_ticket_invalid"
DETAIL_TICKET_EXPIRED = "chat_ticket_expired"
DETAIL_ROUNDS_EXHAUSTED = "chat_tool_rounds_exhausted"
DETAIL_DAILY_LIMIT = "chat_daily_limit_reached"
DETAIL_IP_DAILY_LIMIT = "chat_ip_daily_limit_reached"
DETAIL_UPSTREAM_BUSY = "chat_upstream_busy"
DETAIL_FAILED = "chat_failed"
