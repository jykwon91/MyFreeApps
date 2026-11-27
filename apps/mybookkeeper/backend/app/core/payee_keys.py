"""Who a payment went to, as Monthly expenses shows it, the key a
remembered payee (``loan_payees``) is matched on, and the key a payee
rule (``classification_rules``) is learned and matched on."""
from __future__ import annotations

from app.core import payment_reference_patterns as refs
from app.core.monthly_expense_constants import PAYEE_PREFIXES, UNKNOWN_PAYEE
from app.core.vendors import normalize_vendor


def payee_name(vendor: str | None, description: str | None) -> str:
    """The merchant, or the person a payment app sent money to."""
    name = (vendor or description or "").strip()
    folded = name.casefold()
    for prefix in PAYEE_PREFIXES:
        if folded.startswith(prefix) and len(name) > len(prefix):
            return name[len(prefix):].strip()
    return name or UNKNOWN_PAYEE


def normalized_payee(name: str) -> str:
    """Case-folded, whitespace collapsed. Empty for a blank name."""
    return " ".join(name.split()).casefold()


def payee_key(vendor: str | None, description: str | None) -> str | None:
    """What a payment is matched against remembered payees on; None when it
    names nobody."""
    name = (vendor or description or "").strip()
    return normalized_payee(payee_name(vendor, description)) if name else None


def payee_rule_key(vendor: str | None) -> str:
    """The payee a descriptor names, without the reference that makes each payment unique.

    "Zelle payment to Silvia 29520127614" and "Zelle payment to Silvia 31715789323"
    are one payee: "zelle payment to silvia". The key is the descriptor
    (``normalize_vendor``) cut off where the first reference starts, so it is always a
    prefix of the normalised descriptor and a rule on it matches every payment to that
    payee. Empty for a blank vendor.
    """
    words = normalize_vendor(vendor).split(" ")
    kept = words[:1]
    for index, word in enumerate(words[1:], start=1):
        next_word = words[index + 1] if index + 1 < len(words) else ""
        cut = _before_reference(word, next_word)
        if cut is not None:
            if cut:
                kept.append(cut)
            break
        kept.append(word)
    return " ".join(kept).rstrip(refs.TRAILING_PUNCTUATION) or words[0]


def _before_reference(word: str, next_word: str) -> str | None:
    """None when the word isn't a reference; else the part of it before the reference."""
    star = refs.STAR_REFERENCE.search(word)
    if star:
        return word[: star.start()]
    if word in refs.ACH_ENTRY_CODES and next_word.startswith(refs.ACH_ID_WORD):
        return ""
    if word in refs.REFERENCE_LABELS and any(char.isdigit() for char in next_word):
        return ""
    is_long_number = (
        refs.LONG_NUMBER.fullmatch(word) is not None
        and sum(char.isdigit() for char in word) >= refs.LONG_NUMBER_MIN_DIGITS
    )
    if (
        is_long_number
        or refs.LABELLED_REFERENCE.fullmatch(word)
        or refs.STORE_NUMBER.fullmatch(word)
        or refs.CONFIRMATION_ID.fullmatch(word)
    ):
        return ""
    return None
