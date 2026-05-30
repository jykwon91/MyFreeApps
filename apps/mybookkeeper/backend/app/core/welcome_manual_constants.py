"""Constants for the guest welcome-manual domain.

Field bounds are mirrored by the Pydantic schemas; keeping them here gives the
service-layer seed and the schema validation a single source of truth.
"""

WELCOME_MANUAL_TITLE_MAX_LEN = 200
WELCOME_MANUAL_SECTION_TITLE_MAX_LEN = 200

# Upper bound on sections per manual — a guard against a client expanding a
# single manual into an unbounded number of rows. 50 is far above any real
# welcome guide (Wi-Fi, trash, laundry, parking, check-out, house rules…).
WELCOME_MANUAL_MAX_SECTIONS = 50

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
