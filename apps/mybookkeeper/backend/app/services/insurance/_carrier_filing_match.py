"""Match a policy's carrier to the filings that carrier made, and do the maths.

Pure functions, no I/O, so the matching rules can be tested against the real
names both sides use. The two sides never agree on spelling: an operator writes
"SafePoint" on a policy, TDI publishes "SAFEPOINT INSURANCE COMPANY", and the
same company appears again as "SafePoint Florida Insurance Co". Comparing the
strings as typed matches almost nothing.

The rule is deliberately conservative. A filing is attributed to a policy only
when the policy's distinguishing words are all present in the filing's company
name. That misses some real matches — it will not connect "Benchmark" to a
filing made under a parent's name — and the service reports an unmatched
carrier as unmatched rather than as "no increases coming". A missed match shows
up as a gap the operator can see; a wrong match would tell them their premium
is rising when it is not.
"""
from __future__ import annotations

import datetime as _dt
import re

from app.core.tdi_rate_filings_constants import FILING_LOOKBACK_DAYS
from app.schemas.insurance.insurance_rate_filing import InsuranceRateFiling

# Words that identify a corporate form rather than a company. Left in, every
# carrier matches every other carrier, because "INSURANCE COMPANY" is the
# majority of most names.
_GENERIC_TOKENS: frozenset[str] = frozenset({
    "INSURANCE",
    "INSURANCES",
    "ASSURANCE",
    "COMPANY",
    "COMPANIES",
    "CO",
    "CORP",
    "CORPORATION",
    "INC",
    "INCORPORATED",
    "LLC",
    "LP",
    "LTD",
    "GROUP",
    "HOLDINGS",
    "MUTUAL",
    "EXCHANGE",
    "RECIPROCAL",
    "UNDERWRITERS",
    "UNDERWRITING",
    "SPECIALTY",
    "CASUALTY",
    "PROPERTY",
    "FIRE",
    "GENERAL",
    "NATIONAL",
    "AMERICAN",
    "AMERICA",
    "US",
    "USA",
    "THE",
    "OF",
    "AND",
    "SERVICES",
    "AGENCY",
    "LLOYDS",
    "LLOYD",
    "SYNDICATE",
    "TEXAS",
    "TX",
})

_WORD = re.compile(r"[A-Z0-9]+")

# An operator writes a placed-through-two-parties policy as "Benchmark/Swyfft"
# or "Benchmark (Swyfft)" — the fronting carrier and the MGA that wrote it.
# Either name may be the one TDI filed under, so both are tried.
_CARRIER_SPLIT = re.compile(r"[/|,()&]| dba | DBA |\bthrough\b", re.IGNORECASE)


def carrier_tokens(name: str | None) -> frozenset[str]:
    """The words that actually distinguish one carrier from another."""
    if not name:
        return frozenset()
    words = _WORD.findall(name.upper())
    return frozenset(word for word in words if word not in _GENERIC_TOKENS)


def carrier_aliases(name: str | None) -> list[frozenset[str]]:
    """Each name an operator may have crammed into one carrier field.

    Returns one token set per alias, dropping the ones left empty after generic
    words are removed — "Texas Insurance Co" alone identifies nothing, and
    treating it as a match key would attach every dwelling filing in the state
    to that policy.
    """
    if not name:
        return []
    parts = [part for part in _CARRIER_SPLIT.split(name) if part and part.strip()]
    seen: list[frozenset[str]] = []
    for part in parts or [name]:
        tokens = carrier_tokens(part)
        if tokens and tokens not in seen:
            seen.append(tokens)
    return seen


def matches_carrier(policy_carrier: str | None, filing_company: str) -> bool:
    """True when this filing was made by the carrier written on the policy.

    Containment in one direction only: every distinguishing word the operator
    wrote must appear in the filing's company name. "SafePoint" matches
    "SAFEPOINT INSURANCE COMPANY" because the filing carries the extra words a
    legal name has and the operator's does not.

    The reverse direction is deliberately not allowed, and the live data shows
    why. "State Farm Lloyds" reduces to {STATE, FARM}; "STATE NATIONAL
    INSURANCE COMPANY, INC." reduces to {STATE}, since NATIONAL and INSURANCE
    are corporate boilerplate. Accepting the filing's tokens as a subset of the
    policy's would attribute State National's rate filings to a State Farm
    policy — a different company, and a premium increase the operator will
    never be charged. Requiring the operator's words to be the ones present
    costs some real matches, which surface as an explicit "no filings found"
    rather than as false reassurance.
    """
    filing_tokens = carrier_tokens(filing_company)
    if not filing_tokens:
        return False
    return any(alias <= filing_tokens for alias in carrier_aliases(policy_carrier))


def is_recent(filing: InsuranceRateFiling, *, today: _dt.date) -> bool:
    """Filed recently enough to still say something about the next renewal.

    A filing with no recorded date is kept. TDI publishes rows before every
    field is populated, and discarding them would quietly drop the newest
    filings — the ones that matter most.
    """
    if filing.filed_date is None:
        return True
    return (today - filing.filed_date).days <= FILING_LOOKBACK_DAYS


def applies_by(filing: InsuranceRateFiling, *, renewal: _dt.date) -> bool:
    """True when the new rate is in effect by the time the policy renews.

    A filing with no renewal effective date is treated as applying. 310 of the
    704 dwelling filings leave that column blank, and reading blank as "does
    not apply" would drop nearly half the dataset — including increases the
    operator will in fact be charged.
    """
    if filing.effective_date_renewal is None:
        return True
    return filing.effective_date_renewal <= renewal


def compound_change_pct(filings: list[InsuranceRateFiling]) -> float | None:
    """The change the policy is most likely to see, as a percentage.

    Two rules, and the second is the one that matters. Filings compound rather
    than sum — two 10% increases are 21%, because the second applies to the
    already-raised rate. But they only compound *within one rate program*. A
    carrier files separately for each book it writes, and Foremost's live data
    shows four at once: Landlord, Owner Occupied, Vacant, and a condominium
    program. Those are different rate books, the operator's policy sits in
    exactly one of them, and multiplying all four together would produce a
    number no policy will ever be charged.

    Which program is the operator's is not recorded anywhere, so the most
    recently filed one is used — a carrier's newest filing is the one a
    renewal is most likely to land on. Every matched filing is returned
    alongside this figure with its program named, so an operator who knows
    their program can see the rest.

    Only in-force filings that state a change are counted: a pending filing has
    not been approved, and a withdrawn one never will be.

    Returns None when nothing counted, which is not the same as 0.0%. Zero
    means the carrier filed and held its rates flat — worth showing, and the
    signal that puts them on the shortlist to call.
    """
    usable = [
        filing
        for filing in filings
        if filing.is_in_force and filing.percent_change is not None
    ]
    if not usable:
        return None

    programs: dict[str, list[InsuranceRateFiling]] = {}
    for filing in usable:
        programs.setdefault(filing.product_name or "", []).append(filing)

    def _newest(group: list[InsuranceRateFiling]) -> _dt.date:
        return max((f.filed_date or _dt.date.min) for f in group)

    chosen = max(programs.values(), key=_newest)

    combined = 1.0
    for filing in chosen:
        combined *= 1.0 + (filing.percent_change / 100.0)
    return round((combined - 1.0) * 100.0, 2)


def project_premium_cents(
    current_premium_cents: int | None, change_pct: float | None,
) -> int | None:
    """The current premium moved by the filed change.

    An estimate, not a quote. A rate filing is a statewide average across the
    carrier's whole book, and an individual property's renewal also moves with
    its own coverage amount, claims and reunderwriting. It is the right order
    of magnitude and the right direction, which is what makes it worth acting
    on months before the renewal notice arrives.
    """
    if current_premium_cents is None or change_pct is None:
        return None
    return round(current_premium_cents * (1.0 + change_pct / 100.0))
