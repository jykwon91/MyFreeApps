"""Limits for lease-template uploads."""

# A bundle is a lease plus its addenda (house rules, pet disclosure, ...); ten
# is well above any real bundle and bounds how much one request holds in memory
# (ten files at the per-file cap is 250 MB).
MAX_LEASE_TEMPLATE_FILES = 10

UNREADABLE_TEMPLATE_MESSAGE = (
    "{filename} could not be read. Re-save it as a valid .docx, .md or .txt file and try again."
)
STORAGE_UNAVAILABLE_MESSAGE = (
    "File storage is temporarily unavailable. Nothing was saved; please try again in a moment."
)
