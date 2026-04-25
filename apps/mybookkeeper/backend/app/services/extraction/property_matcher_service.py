import logging
import re
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from app.models.properties.property import Property
from app.repositories import property_repo

logger = logging.getLogger(__name__)

# Tags that indicate the address is a rental property, not a business or personal address
_PROPERTY_RELATED_TAGS = frozenset({
    "rental_revenue", "cleaning_fee_revenue",
    "maintenance", "contract_work", "cleaning_expense", "utilities",
    "management_fee", "insurance", "mortgage_interest", "mortgage_principal",
    "taxes", "net_income",
})

# Canonical abbreviations: map all variants to a single short form.
# Both directions are covered so "street" -> "st" and "st" stays "st".
_ABBREVIATIONS: dict[str, str] = {
    "street": "st", "avenue": "ave", "drive": "dr", "boulevard": "blvd",
    "road": "rd", "lane": "ln", "court": "ct", "place": "pl",
    "circle": "cir", "terrace": "ter", "trail": "trl", "way": "wy",
    "highway": "hwy", "parkway": "pkwy", "apartment": "apt",
    "suite": "ste", "unit": "unit", "north": "n", "south": "s",
    "east": "e", "west": "w", "northeast": "ne", "northwest": "nw",
    "southeast": "se", "southwest": "sw",
}

# US state names to abbreviations
_STATE_ABBREVS: dict[str, str] = {
    "alabama": "al", "alaska": "ak", "arizona": "az", "arkansas": "ar",
    "california": "ca", "colorado": "co", "connecticut": "ct",
    "delaware": "de", "florida": "fl", "georgia": "ga", "hawaii": "hi",
    "idaho": "id", "illinois": "il", "indiana": "in", "iowa": "ia",
    "kansas": "ks", "kentucky": "ky", "louisiana": "la", "maine": "me",
    "maryland": "md", "massachusetts": "ma", "michigan": "mi",
    "minnesota": "mn", "mississippi": "ms", "missouri": "mo",
    "montana": "mt", "nebraska": "ne", "nevada": "nv",
    "new hampshire": "nh", "new jersey": "nj", "new mexico": "nm",
    "new york": "ny", "north carolina": "nc", "north dakota": "nd",
    "ohio": "oh", "oklahoma": "ok", "oregon": "or", "pennsylvania": "pa",
    "rhode island": "ri", "south carolina": "sc", "south dakota": "sd",
    "tennessee": "tn", "texas": "tx", "utah": "ut", "vermont": "vt",
    "virginia": "va", "washington": "wa", "west virginia": "wv",
    "wisconsin": "wi", "wyoming": "wy",
}

# 5-digit US zip code pattern
_ZIP_RE = re.compile(r"\b\d{5}(?:-\d{4})?\b")


def _normalize(s: str) -> str:
    """Normalize an address string for comparison.

    Steps: lowercase, strip punctuation, collapse whitespace,
    expand/collapse abbreviations to canonical short form,
    strip zip codes (they cause false negatives when one address has them
    and the other doesn't).
    """
    text = s.lower()
    # Remove zip codes before stripping punctuation (need the dash intact for zip+4)
    text = _ZIP_RE.sub("", text)
    # Strip punctuation and commas
    text = re.sub(r"[^a-z0-9 ]", "", text)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    # Replace state names with abbreviations (must happen before single-word abbrevs
    # since "new york" contains "new" which shouldn't be abbreviated alone)
    for state_name, abbrev in _STATE_ABBREVS.items():
        text = re.sub(rf"\b{re.escape(state_name)}\b", abbrev, text)
    # Replace street/direction abbreviations
    tokens = text.split()
    tokens = [_ABBREVIATIONS.get(t, t) for t in tokens]
    return " ".join(tokens)


def _split_combined_address(raw: str) -> list[str]:
    """Split combined addresses like '6732/6734 Peerless St' or 'addr1 | addr2'.

    Returns individual address strings. If no split is needed, returns [raw].
    """
    # Pipe-separated (Claude uses " | " for multiple addresses)
    if " | " in raw:
        return [part.strip() for part in raw.split(" | ") if part.strip()]

    # Slash-separated street numbers: "6732/6734 Peerless St"
    # Detect pattern: digits/digits followed by the rest of the address
    m = re.match(r"^(\d+)\s*/\s*(\d+)\s+(.+)$", raw.strip())
    if m:
        return [f"{m.group(1)} {m.group(3)}", f"{m.group(2)} {m.group(3)}"]

    return [raw]


def _extract_street_number(normalized: str) -> str | None:
    """Extract the leading street number from a normalized address."""
    m = re.match(r"^(\d+)\b", normalized)
    return m.group(1) if m else None


def _token_overlap_ratio(tokens_a: list[str], tokens_b: list[str]) -> float:
    """Compute the ratio of shared tokens to the smaller set size.

    This is asymmetric-friendly: if one address has "6732 peerless st houston tx"
    and the other has "6732 peerless houston tx", the overlap is 4/4 = 1.0
    because all tokens in the shorter address appear in the longer one.
    """
    if not tokens_a or not tokens_b:
        return 0.0
    set_a = set(tokens_a)
    set_b = set(tokens_b)
    overlap = len(set_a & set_b)
    # Divide by the smaller set so partial addresses match full ones
    return overlap / min(len(set_a), len(set_b))


# Minimum token overlap ratio for a fuzzy match (street number must also match)
_FUZZY_THRESHOLD = 0.75


def _match_single(norm: str, properties: list[Property]) -> uuid.UUID | None:
    """Match a normalized address against a list of properties.

    Tier 1: prefix-token match (first 3 tokens) or substring containment.
    Tier 2: same street number + fuzzy token overlap above threshold.
    """
    key_tokens = norm.split()[:3]
    if not key_tokens:
        return None

    # Tier 1: exact prefix or substring (fast, high confidence)
    for prop in properties:
        for candidate in filter(None, [prop.address, prop.name]):
            norm_cand = _normalize(candidate)
            cand_tokens = norm_cand.split()
            if cand_tokens[: len(key_tokens)] == key_tokens:
                return prop.id
            if norm and (norm in norm_cand or norm_cand in norm):
                return prop.id

    # Tier 2: street-number + fuzzy token overlap
    input_number = _extract_street_number(norm)
    if not input_number:
        return None
    input_tokens = norm.split()
    best_match: uuid.UUID | None = None
    best_ratio = 0.0
    for prop in properties:
        for candidate in filter(None, [prop.address, prop.name]):
            norm_cand = _normalize(candidate)
            cand_number = _extract_street_number(norm_cand)
            if cand_number != input_number:
                continue
            cand_tokens = norm_cand.split()
            ratio = _token_overlap_ratio(input_tokens, cand_tokens)
            if ratio >= _FUZZY_THRESHOLD and ratio > best_ratio:
                best_ratio = ratio
                best_match = prop.id
    return best_match


def match_property_id(extracted_address: str, properties: list[Property]) -> uuid.UUID | None:
    parts = _split_combined_address(extracted_address)
    for part in parts:
        matched = _match_single(_normalize(part), properties)
        if matched:
            return matched
    return None


async def resolve_property_id(
    extracted_address: str | None,
    explicit_property_id: uuid.UUID | None,
    organization_id: uuid.UUID,
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
    tags: list[str] | None = None,
) -> uuid.UUID | None:
    if explicit_property_id:
        return explicit_property_id
    if not extracted_address or not extracted_address.strip():
        return None

    properties = await property_repo.list_by_org(db, organization_id)
    prop_list = list(properties)
    matched = match_property_id(extracted_address, prop_list)
    if matched:
        return matched

    if not user_id:
        return None

    # Only auto-create if the tags indicate this is a rental property address,
    # not a business, vendor, or personal address
    is_property_related = tags and any(t in _PROPERTY_RELATED_TAGS for t in tags)
    if not is_property_related:
        return None

    # For combined addresses, auto-create each individual address as a separate property
    parts = _split_combined_address(extracted_address)
    first_id: uuid.UUID | None = None
    for part in parts:
        addr = part.strip()
        # Check if this individual part matches an existing property
        if match_property_id(addr, prop_list):
            if not first_id:
                first_id = match_property_id(addr, prop_list)
            continue
        prop = Property(
            organization_id=organization_id,
            user_id=user_id,
            name=addr,
            address=addr,
        )
        created = await property_repo.create(db, prop)
        logger.info("Auto-created property '%s' for org %s", addr, organization_id)
        if not first_id:
            first_id = created.id
        prop_list.append(created)

    return first_id
