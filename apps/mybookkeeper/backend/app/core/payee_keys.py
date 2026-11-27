"""Who a payment went to, and the one key every payee is matched on.

``payee_name`` is the payee as Monthly expenses shows it: the merchant, or the
person a payment app sent money to, without the reference that makes each
payment unique. ``payee_key`` is that name normalised. Monthly expenses groups
on it, remembered loan payees (``loan_payees``) and payee rules
(``classification_rules``) are stored and matched on it, so
"Zelle payment to Silvia 29520127614" and "Zelle payment to Silvia 31715789323"
are one payee, "silvia".

The key is always part of ``normalize_vendor(descriptor)``, starting at a word, so a
rule on it matches every payment to that payee (``WORD_START``).
"""
from __future__ import annotations

from app.core import payment_reference_patterns as refs
from app.core.monthly_expense_constants import PAYEE_PREFIXES, UNKNOWN_PAYEE
from app.core.vendors import normalize_vendor

# A vendor rule's pattern matches where it starts a word of the payee: both sides
# are prefixed with this before the containment check.
WORD_START = " "


def payee_name(vendor: str | None, description: str | None) -> str:
    """The merchant, or the person a payment app sent money to, without the payment reference."""
    name = _without_app_prefix(" ".join((vendor or description or "").split()))
    return _before_first_reference(name) or UNKNOWN_PAYEE


def payee_key(vendor: str | None, description: str | None) -> str | None:
    """What a payment is matched and grouped on; None when it names nobody."""
    if not (vendor or description or "").strip():
        return None
    return normalize_vendor(payee_name(vendor, description)) or None


def _without_app_prefix(name: str) -> str:
    folded = name.casefold()
    for prefix in PAYEE_PREFIXES:
        if folded.startswith(prefix) and len(name) > len(prefix):
            return name[len(prefix):].strip()
    return name


def _before_first_reference(name: str) -> str:
    """The name cut off where the first payment reference starts. The first word is never cut;
    an ACH company ID ("PPD ID: 1000008113") ends the name and is kept."""
    words = name.split(" ")
    kept = words[:1]
    for index, word in enumerate(words[1:], start=1):
        next_word = words[index + 1].lower() if index + 1 < len(words) else ""
        if word.lower() in refs.ACH_ENTRY_CODES and next_word.startswith(refs.ACH_ID_WORD):
            kept.extend(_ach_company_id(words[index:]))
            break
        cut = _before_reference(word.lower(), next_word)
        if cut is not None:
            if cut:
                kept.append(word[: len(cut)])
            break
        kept.append(word)
    return " ".join(kept).rstrip(refs.TRAILING_PUNCTUATION) or words[0]


def _ach_company_id(words: list[str]) -> list[str]:
    """The ACH tail: the entry code, "ID:" and the ID ("ID:1000008113" is one word)."""
    code, label = words[0], words[1]
    if any(char.isdigit() for char in label):
        return [code, label]
    return words[:3]


def _before_reference(word: str, next_word: str) -> str | None:
    """None when the (lower-cased) word isn't a reference; else the part of it before the reference."""
    star = refs.STAR_REFERENCE.search(word)
    if star:
        return word[: star.start()]
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
