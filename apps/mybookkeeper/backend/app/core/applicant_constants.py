"""Constants for the Applicants domain.

Field-length caps mirror the column ``String(N)`` lengths on the SQLAlchemy
model — keep them in sync. Business rules (minimum age, etc.) live here so
they can be tuned without touching service or schema files.
"""

# Field max lengths — match ``models/applicants/applicant.py`` column types.
APPLICANT_LEGAL_NAME_MAX = 255
APPLICANT_DOB_MAX = 50
APPLICANT_EMPLOYER_MAX = 255
APPLICANT_VEHICLE_MAX = 255
APPLICANT_PETS_MAX = 1000
APPLICANT_REFERRED_BY_MAX = 255

# Minimum applicant age for rental eligibility — codified per typical rental
# policy. Tunable here so a future per-org override can layer on top without
# touching service code.
APPLICANT_MINIMUM_AGE_YEARS = 18

# ISO-8601 ``YYYY-MM-DD`` is the canonical wire / storage format for the
# encrypted ``dob`` column. The promote schema parses date inputs, the repo
# stores ISO strings.
APPLICANT_DOB_ISO_FORMAT = "%Y-%m-%d"
