"""Tests for industry-chip expansion + structured-query assembly.

Covers:
- ``expand_excluded_keywords`` merges chip expansions with custom keywords,
  deduplicates, lowercases, and silently skips unknown chips.
- ``_build_jsearch_query`` assembles Boolean queries from structured
  ``roles`` / ``skills`` config; falls back to legacy ``query``.
- End-to-end: a structured config with industry chips drops the right
  postings via ``_apply_post_fetch_filters``.
"""
from __future__ import annotations

from app.services.discovery.discovery_fetch_service import (
    _apply_post_fetch_filters,
    _build_jsearch_query,
)
from app.services.discovery.industry_denylists import (
    INDUSTRY_DENYLISTS,
    expand_excluded_keywords,
)


# ===========================================================================
# expand_excluded_keywords
# ===========================================================================


def test_expand_known_chip_returns_keywords() -> None:
    result = expand_excluded_keywords(chips=["government_defense"], custom_keywords=None)
    assert "lockheed martin" in result
    assert "secret clearance" in result
    assert all(kw == kw.lower() for kw in result)


def test_expand_unknown_chip_silently_skipped() -> None:
    result = expand_excluded_keywords(
        chips=["not_a_real_chip", "government_defense"],
        custom_keywords=None,
    )
    # Real chip's keywords still expanded; unknown chip just doesn't add.
    assert "lockheed martin" in result


def test_expand_merges_chip_and_custom_dedups() -> None:
    # "lockheed" is in the chip's expanded list AND the custom list.
    result = expand_excluded_keywords(
        chips=["government_defense"],
        custom_keywords=["lockheed martin", "Anthropic Crypto Bot"],
    )
    # Each entry appears exactly once.
    assert result.count("lockheed martin") == 1
    assert "anthropic crypto bot" in result  # lowercased


def test_expand_handles_none_inputs() -> None:
    assert expand_excluded_keywords(None, None) == []
    assert expand_excluded_keywords([], []) == []


def test_expand_skips_non_string_entries() -> None:
    result = expand_excluded_keywords(
        chips=[123, "government_defense", None],  # type: ignore[list-item]
        custom_keywords=[True, "valid", ""],  # type: ignore[list-item]
    )
    assert "valid" in result
    assert "lockheed martin" in result


def test_all_known_chip_keys_have_non_empty_expansions() -> None:
    """Every chip in INDUSTRY_DENYLISTS must expand to at least one
    keyword — an empty list would be a footgun."""
    for chip_key, keywords in INDUSTRY_DENYLISTS.items():
        assert len(keywords) > 0, f"chip {chip_key!r} has empty expansion"
        # All keywords lowercase for the case-insensitive match.
        for kw in keywords:
            assert kw == kw.lower(), f"{chip_key}/{kw!r} not lowercased"


# ===========================================================================
# _build_jsearch_query
# ===========================================================================


def _cfg(**kwargs) -> "JSearchSourceConfig":
    """Tiny helper so test bodies stay focused on inputs."""
    from app.schemas.discovery.jsearch_source_config import JSearchSourceConfig
    return JSearchSourceConfig(**kwargs)


def test_build_query_single_role_no_skills() -> None:
    assert _build_jsearch_query(_cfg(roles=["Backend Engineer"])) == '"Backend Engineer"'


def test_build_query_single_role_with_skills() -> None:
    result = _build_jsearch_query(_cfg(
        roles=["Senior Backend Engineer"],
        skills=["Python", "FastAPI"],
    ))
    assert result == '"Senior Backend Engineer" (Python OR FastAPI)'


def test_build_query_multiple_roles() -> None:
    result = _build_jsearch_query(_cfg(
        roles=["Senior Backend Engineer", "Staff Software Engineer"],
    ))
    assert result == '("Senior Backend Engineer" OR "Staff Software Engineer")'


def test_build_query_legacy_raw_query_passes_through() -> None:
    assert _build_jsearch_query(_cfg(query="anything goes")) == "anything goes"


def test_build_query_legacy_takes_precedence_over_structured() -> None:
    """If both ``query`` and ``roles`` are set, ``query`` wins. Legacy
    saved searches keep their behavior; new structured ones must not
    set ``query``."""
    result = _build_jsearch_query(_cfg(query="raw boolean", roles=["ignored"]))
    assert result == "raw boolean"


def test_build_query_empty_when_nothing_set() -> None:
    assert _build_jsearch_query(_cfg()) == ""


def test_build_query_skips_blank_roles_and_skills() -> None:
    # JSearchSourceConfig's strict typing rejects None entries in lists,
    # which is the whole point of this PR — typos / wrong types fail
    # at validation time, not silently pass through. So this test now
    # only exercises the blank-string handling that survives validation.
    result = _build_jsearch_query(_cfg(
        roles=["", "  ", "Real Role"],
        skills=["", "Python"],
    ))
    assert result == '"Real Role" Python'


def test_build_query_single_word_role_not_quoted() -> None:
    """One-word role titles don't need phrase quoting."""
    result = _build_jsearch_query(_cfg(roles=["Engineer"]))
    assert result == "Engineer"


# ===========================================================================
# End-to-end: structured config + industry chip → post-fetch filter
# ===========================================================================


def _posting(**overrides):
    base = {
        "title": "Senior Software Engineer",
        "company_name": "Acme",
        "description": "We're a SaaS company hiring engineers.",
        "source_publisher": "LinkedIn",
        "salary_min": None,
    }
    base.update(overrides)
    return base


def test_government_defense_chip_drops_lockheed() -> None:
    postings = [
        _posting(company_name="Lockheed Martin"),
        _posting(company_name="Stripe"),
    ]
    config = {"excluded_industry_chips": ["government_defense"]}
    result = _apply_post_fetch_filters(postings, config)
    assert len(result) == 1
    assert result[0]["company_name"] == "Stripe"


def test_government_defense_chip_drops_clearance_required() -> None:
    postings = [
        _posting(description="Active TS/SCI clearance required."),
        _posting(description="Build cool consumer features."),
    ]
    config = {"excluded_industry_chips": ["government_defense"]}
    result = _apply_post_fetch_filters(postings, config)
    assert len(result) == 1
    assert "ts/sci" not in result[0]["description"].lower()


def test_chip_and_custom_combine() -> None:
    postings = [
        _posting(title="Junior Eng"),  # custom
        _posting(company_name="Lockheed Martin"),  # chip
        _posting(title="Senior Eng", company_name="Stripe"),  # KEEP
    ]
    config = {
        "excluded_industry_chips": ["government_defense"],
        "excluded_keywords": ["junior"],
    }
    result = _apply_post_fetch_filters(postings, config)
    assert len(result) == 1
    assert result[0]["company_name"] == "Stripe"


def test_staffing_chip_drops_via_dice_postings() -> None:
    postings = [
        _posting(company_name="Jobs via Dice", description="W2 contract"),
        _posting(company_name="Real Company", description="Direct hire"),
    ]
    config = {"excluded_industry_chips": ["staffing_recruiting"]}
    result = _apply_post_fetch_filters(postings, config)
    assert len(result) == 1
    assert result[0]["company_name"] == "Real Company"


# ===========================================================================
# Frontend / backend key drift — industry-chips.ts vs INDUSTRY_DENYLISTS
# ===========================================================================


def _read_frontend_chip_keys() -> list[str]:
    """Parse industry-chips.ts to extract every chip's ``value`` field.

    The TS file declares ``INDUSTRY_CHIPS: IndustryChip[]`` where each
    element is an object literal with ``value: "<key>"`` and ``label: "..."``.
    We regex out the ``value`` strings because they are the keys that must
    exist in ``INDUSTRY_DENYLISTS``.

    If the TS file's shape changes (e.g. the field is renamed from ``value``
    to ``key``), this regex stops matching and the test fails loudly with
    "Frontend industry-chips.ts produced no keys" — which is the right signal
    to update the regex here rather than to silently pass.
    """
    from pathlib import Path
    import re

    chips_ts = (
        Path(__file__).parent.parent.parent
        / "frontend"
        / "src"
        / "features"
        / "discover"
        / "industry-chips.ts"
    )
    text = chips_ts.read_text(encoding="utf-8")
    return re.findall(r'\bvalue\s*:\s*"([^"]+)"', text)


def test_every_frontend_chip_has_backend_denylist_entry() -> None:
    """Every chip value in ``INDUSTRY_CHIPS`` (frontend) must appear as a key
    in ``INDUSTRY_DENYLISTS`` (backend).

    Without a backend entry, ``expand_excluded_keywords`` silently skips the
    chip and the operator's selection becomes a no-op — they believe a filter
    is active when it isn't.

    If this test fails, the missing keys must be added to
    ``industry_denylists.py`` OR the chip removed from ``industry-chips.ts``.
    Do NOT auto-fix in this test — the human decides which side is canonical.
    """
    chip_keys = _read_frontend_chip_keys()
    assert chip_keys, (
        "Frontend industry-chips.ts produced no keys — "
        "the value-field regex may be stale or the file has moved"
    )
    missing = [k for k in chip_keys if k not in INDUSTRY_DENYLISTS]
    assert missing == [], (
        f"Frontend INDUSTRY_CHIPS has keys with no backend entry in "
        f"INDUSTRY_DENYLISTS: {missing}. "
        f"Add them to apps/myjobhunter/backend/app/services/discovery/"
        f"industry_denylists.py or remove from industry-chips.ts."
    )
