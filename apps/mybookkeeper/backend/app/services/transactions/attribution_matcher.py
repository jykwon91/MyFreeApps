"""Pure payer-name / payer-alias matchers for rent attribution.

No DB or async I/O at call time — these functions are unit-testable in
isolation (see tests/test_attribution_matcher.py). They are kept separate from
``attribution_service`` (the DB-aware orchestrator) so the matching logic stays
a small, pure, heavily-tested unit and the service file stays focused on
orchestration.
"""
import uuid
from collections.abc import Sequence

from app.models.applicants.applicant import Applicant
from app.models.transactions.payer_alias import PayerAlias


def normalize_handle(payer_handle: str | None) -> str:
    """Normalize a payer handle (Zelle email/phone, Venmo @user, Cash App $tag).

    Mirrors ``payer_alias_repo.normalize_handle`` (kept in sync by contract,
    like ``find_best_match`` mirrors ``normalize_payer_name``). The empty string
    is the canonical "no handle" value so a handle-less incoming payment and a
    handle-less stored alias compare equal.
    """
    return (payer_handle or "").lower().strip()


def resolve_alias(
    candidates: Sequence[PayerAlias],
    incoming_handle: str | None,
) -> tuple[uuid.UUID | None, str]:
    """Resolve learned aliases for one payer name to a tenant.

    ``candidates`` is every :class:`PayerAlias` sharing the incoming payment's
    normalized payer name (already org-filtered by the repo). Returns
    ``(applicant_id, outcome)``:

      - ``"alias"``     — auto-attribute to ``applicant_id``.
      - ``"ambiguous"`` — the name maps to more than one tenant and the handle
        can't disambiguate; caller routes to review (never silently guesses).
      - ``"none"``      — no learned alias for this name; caller falls through
        to name matching.

    Resolution order:
      1. **Handle-exact** — if the incoming payment carries a handle and exactly
         one tenant is aliased under it, that tenant wins even when same-named
         aliases point elsewhere (two different people who share a name).
      2. **Name-level** — otherwise, a single distinct tenant across all
         same-named aliases is unambiguous; two or more is ambiguous.
    """
    if not candidates:
        return None, "none"

    handle = normalize_handle(incoming_handle)

    if handle:
        handle_targets = {
            c.applicant_id
            for c in candidates
            if normalize_handle(c.payer_handle) == handle
        }
        if len(handle_targets) == 1:
            return next(iter(handle_targets)), "alias"
        if len(handle_targets) > 1:
            return None, "ambiguous"
        # Handle present but unseen among aliases — fall through to name-level.

    name_targets = {c.applicant_id for c in candidates}
    if len(name_targets) == 1:
        return next(iter(name_targets)), "alias"
    return None, "ambiguous"


def _levenshtein(a: str, b: str) -> int:
    """Compute the Levenshtein edit distance between two strings."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i]
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            curr.append(min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost))
        prev = curr
    return prev[-1]


def find_best_match(
    payer_name: str,
    candidates: Sequence[Applicant],
) -> tuple[Applicant | None, str | None]:
    """Return (best_applicant, confidence) for ``payer_name``.

    Confidence values:
      - ``"auto_exact"``  — exactly ONE case-insensitive exact match
      - ``"fuzzy"``       — exactly ONE best Levenshtein ≤ 2 match, no exact
      - ``"ambiguous"``   — two or more candidates tie at the best score
        (multiple exact matches, or multiple fuzzy matches at the same
        smallest distance ≤ 2). Returns ``(None, "ambiguous")`` so the caller
        queues the payment for manual review instead of silently
        auto-attributing to whichever same-named tenant happened to sort
        first — a wrong-attribution hazard when two ``lease_signed`` tenants
        share a name.
      - ``None``          — no acceptable match found (returns (None, None))
    """
    if not payer_name:
        return None, None

    lower = payer_name.lower().strip()

    # Pass 1 — exact (case-insensitive). A single exact match auto-confirms;
    # two or more tenants sharing the name are ambiguous — do NOT guess.
    exact = [
        a
        for a in candidates
        if a.legal_name and a.legal_name.lower().strip() == lower
    ]
    if len(exact) == 1:
        return exact[0], "auto_exact"
    if len(exact) > 1:
        return None, "ambiguous"

    # Pass 2 — fuzzy (Levenshtein ≤ 2). Track every candidate tied at the
    # current smallest distance; a single closest candidate is a fuzzy
    # proposal, a tie at the best distance is ambiguous (same hazard as
    # duplicate exact names).
    best_dist = 3  # exclusive upper bound — only distances 0..2 qualify
    tied: list[Applicant] = []
    for applicant in candidates:
        if not applicant.legal_name:
            continue
        dist = _levenshtein(lower, applicant.legal_name.lower().strip())
        if dist > 2:
            continue  # never a fuzzy candidate
        if dist < best_dist:
            best_dist = dist
            tied = [applicant]
        elif dist == best_dist:
            tied.append(applicant)

    if tied:  # best_dist is necessarily ≤ 2 here
        if len(tied) == 1:
            return tied[0], "fuzzy"
        return None, "ambiguous"

    return None, None
