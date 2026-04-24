"""Canonical screening question keys and EEOC classification.

question_key values stored in screening_answer must be drawn from ALLOWED_KEYS.
EEOC_KEYS is used at write time to set is_eeoc=True automatically.

Note: HIBP (password breach check) is a planned follow-up, not implemented in Phase 1.
"""

EEOC_KEYS: frozenset[str] = frozenset(
    {
        "eeoc_gender",
        "eeoc_race_ethnicity",
        "eeoc_veteran_status",
        "eeoc_disability_status",
        "eeoc_protected_class",
    }
)

NON_EEOC_KEYS: frozenset[str] = frozenset(
    {
        "work_auth_us",
        "require_sponsorship",
        "willing_to_relocate",
        "salary_expectation",
        "notice_period",
        "years_experience",
        "highest_education",
        "linkedin_url",
        "github_url",
        "portfolio_url",
        "available_start_date",
        "cover_letter",
        "referral_source",
        "willing_to_travel",
        "has_drivers_license",
        "felony_conviction",
        "non_compete_agreement",
    }
)

ALLOWED_KEYS: frozenset[str] = EEOC_KEYS | NON_EEOC_KEYS


def is_eeoc(question_key: str) -> bool:
    """Return True if the question key is EEOC-classified."""
    return question_key in EEOC_KEYS
