"""Constants for the guest welcome-manual domain.

Field bounds are mirrored by the Pydantic schemas; keeping them here gives the
service-layer seed and the schema validation a single source of truth.
"""

WELCOME_MANUAL_TITLE_MAX_LEN = 200
WELCOME_MANUAL_SECTION_TITLE_MAX_LEN = 200
WELCOME_MANUAL_IMAGE_CAPTION_MAX_LEN = 500
# Guest recipient display name (welcome_manual_sends.recipient_name) — bounded
# to fit the encrypted String(255) column with room for the Fernet ciphertext.
WELCOME_MANUAL_RECIPIENT_NAME_MAX_LEN = 200

# Object-key prefix for welcome-manual section images. Combined with the org id
# for tenant isolation: ``{org_id}/welcome-manuals`` → keys land under
# ``{org_id}/welcome-manuals/{uuid}/{filename}`` in the bucket.
WELCOME_MANUAL_STORAGE_DOMAIN = "welcome-manuals"

# Upper bound on sections per manual — a guard against a client expanding a
# single manual into an unbounded number of rows. 50 is far above any real
# welcome guide (Wi-Fi, trash, laundry, parking, check-out, house rules…).
WELCOME_MANUAL_MAX_SECTIONS = 50

# Section fields (label + value pairs, e.g. "Network name" / "Password").
# Bounds mirrored by the Pydantic schemas. ``WELCOME_MANUAL_MAX_FIELDS`` guards
# a single section against unbounded field rows.
WELCOME_MANUAL_MAX_FIELDS = 20
WELCOME_MANUAL_FIELD_LABEL_MAX_LEN = 100
WELCOME_MANUAL_FIELD_VALUE_MAX_LEN = 500
NEW_FIELD_DEFAULT_LABEL = "New field"

# Rooms. A manual can be split into rooms when one property is rented by the
# room — the shared sections (Wi-Fi, trash day, house rules) are written once
# and every room's guide includes them, while a room-scoped section (which
# room is yours, its key, its bathroom) reaches only that room's guest.
# ``room_id IS NULL`` on a section means "shared across all rooms".
WELCOME_MANUAL_MAX_ROOMS = 20
WELCOME_MANUAL_ROOM_NAME_MAX_LEN = 120
NEW_ROOM_DEFAULT_NAME = "New room"

# Outcome statuses for a welcome-manual email send (welcome_manual_sends.status).
# Stored as String(20) + CheckConstraint (never SQLAlchemy Enum, per the schema
# convention). ``sent`` = SMTP accepted; ``failed`` = SMTP rejected/errored;
# ``skipped`` = preconditions unmet (e.g. SMTP not configured on this deploy).
WELCOME_MANUAL_SEND_STATUSES: tuple[str, ...] = ("sent", "failed", "skipped")
WELCOME_MANUAL_SEND_STATUSES_SQL = (
    "(" + ", ".join(f"'{s}'" for s in WELCOME_MANUAL_SEND_STATUSES) + ")"
)

# Stub sections seeded into a new manual when the host opts in
# (``seed_default_sections=True`` on create). Titles only — the host fills in
# the body and adds photos. Ordered the way a host would walk a guest through
# arrival and departure.
DEFAULT_WELCOME_MANUAL_SECTIONS: tuple[str, ...] = (
    "Wi-Fi",
    "Parking",
    "Trash & Recycling",
    "Laundry",
    "Check-out",
)

# Stub fields seeded into a default section when the manual is created with
# ``seed_default_sections=True``. Keyed by the section title; each value is an
# ordered tuple of field labels (values start empty for the host to fill in).
DEFAULT_WELCOME_MANUAL_SECTION_FIELDS: dict[str, tuple[str, ...]] = {
    "Wi-Fi": ("Network name", "Password"),
}

# Restaurant "places" (a guest dining directory) attached directly to a
# manual — no section parent. Bounds mirrored by the Pydantic schemas.
# ``WELCOME_MANUAL_MAX_PLACES`` guards a single manual against unbounded rows.
WELCOME_MANUAL_MAX_PLACES = 200
PLACE_NAME_MAX_LEN = 150
PLACE_CUISINE_MAX_LEN = 50
PLACE_NOTE_MAX_LEN = 500
PLACE_MAP_URL_MAX_LEN = 2048
WELCOME_MANUAL_PRICE_TIERS: tuple[str, ...] = ("$", "$$", "$$$")

# Public PIN-protected share link. ``SHARE_TOKEN_BYTES`` is the
# ``secrets.token_urlsafe`` input size (not the resulting string length —
# base64 expands it by ~4/3). ``SHARE_PIN_LENGTH`` is a 4-digit numeric PIN
# (10,000-value space) gating ALL guest-visible manual content (Wi-Fi,
# check-in, etc.). ``SHARE_UNLOCK_MAX_ATTEMPTS`` /
# ``SHARE_UNLOCK_LOCKOUT_WINDOW_SECONDS`` bound the brute-force surface a
# 10k-space PIN would otherwise present: after this many WRONG PINs the
# manual (keyed on its share token, persisted on the row — NOT the spoofable
# client IP) locks for the window; a correct PIN resets the counter. See
# ``welcome_manual_share_service`` for why the key is the manual, not the IP.
SHARE_TOKEN_BYTES = 24
SHARE_PIN_LENGTH = 4
SHARE_UNLOCK_MAX_ATTEMPTS = 5
SHARE_UNLOCK_LOCKOUT_WINDOW_SECONDS = 900
