"""Auto-categorize transactions by vendor/sender name patterns."""

SENDER_CATEGORY_MAP: dict[str, str] = {
    "centerpoint": "utilities",
    "att.com": "utilities",
    "at&t": "utilities",
    "comcast": "utilities",
    "xfinity": "utilities",
    "spectrum": "utilities",
    "duke energy": "utilities",
    "pg&e": "utilities",
    "water": "utilities",
    "electric": "utilities",
    "gas company": "utilities",
    "constellation": "utilities",
    "frontier": "utilities",
    "reliant": "utilities",
    "txu": "utilities",
    "nrg": "utilities",
    "statefarm": "insurance",
    "state farm": "insurance",
    "allstate": "insurance",
    "geico": "insurance",
    "progressive": "insurance",
    "liberty mutual": "insurance",
    "wellsfargo": "mortgage_interest",
    "wells fargo": "mortgage_interest",
    "chase": "mortgage_interest",
    "bank of america": "mortgage_interest",
    "quicken loans": "mortgage_interest",
    "rocket mortgage": "mortgage_interest",
}


def match_sender_category(vendor: str) -> str | None:
    """Return a category if the vendor matches a known sender pattern, or None."""
    normalized = vendor.lower().strip()
    for pattern, category in SENDER_CATEGORY_MAP.items():
        if pattern in normalized:
            return category
    return None
