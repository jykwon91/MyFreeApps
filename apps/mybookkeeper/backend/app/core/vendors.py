import re

_SUFFIXES = frozenset({
    "llc", "inc", "incorporated", "co", "corp", "corporation",
    "ltd", "limited", "plc", "lp", "llp", "pllc",
})

_SUFFIX_PATTERN = re.compile(
    r",?\s+(?:" + "|".join(re.escape(s) for s in _SUFFIXES) + r")\.?\s*$",
    re.IGNORECASE,
)
_WHITESPACE = re.compile(r"\s+")

_ADDRESS_SUFFIXES = frozenset({
    "st", "street", "ave", "avenue", "blvd", "boulevard",
    "dr", "drive", "ln", "lane", "rd", "road", "ct", "court",
    "pl", "place", "way", "cir", "circle", "pkwy", "parkway",
    "ter", "terrace", "trl", "trail",
})

_ADDRESS_SUFFIX_PATTERN = re.compile(
    r"\b(?:" + "|".join(re.escape(s) for s in _ADDRESS_SUFFIXES) + r")\.?\b",
    re.IGNORECASE,
)

_UNIT_PATTERN = re.compile(
    r"\b(?:apt|suite|ste|unit|#)\s*[\w-]*",
    re.IGNORECASE,
)

_STATE_ZIP_PATTERN = re.compile(
    r"\b[A-Z]{2}(?:\s*\d{5}(?:-\d{4})?)?\s*$",
    re.IGNORECASE,
)

_COMMA_SEP = re.compile(r",\s*")


def normalize_vendor(name: str | None) -> str:
    if not name:
        return ""
    result = name.strip().lower()
    result = _SUFFIX_PATTERN.sub("", result)
    result = _WHITESPACE.sub(" ", result).strip()
    return result


def normalize_address(address: str | None) -> str:
    if not address:
        return ""
    result = address.strip().lower()
    result = _UNIT_PATTERN.sub("", result)
    result = _ADDRESS_SUFFIX_PATTERN.sub("", result)
    result = _STATE_ZIP_PATTERN.sub("", result)
    result = _COMMA_SEP.sub(" ", result)
    result = _WHITESPACE.sub(" ", result).strip()
    return result
