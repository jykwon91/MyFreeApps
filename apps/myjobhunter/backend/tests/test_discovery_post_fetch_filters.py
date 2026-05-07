"""Unit tests for the discovery post-fetch filter.

Pure function — no DB, no HTTP. Verifies the operator's
``min_salary_usd`` and ``excluded_keywords`` filters drop the right
postings before they're upserted into ``discovered_jobs``.
"""
from __future__ import annotations

from app.services.discovery.discovery_fetch_service import (
    _apply_post_fetch_filters,
)


def _posting(**overrides):
    base = {
        "title": "Senior Software Engineer",
        "company_name": "Acme",
        "description": "We're looking for a senior engineer.",
        "source_publisher": "LinkedIn",
        "salary_min": None,
    }
    base.update(overrides)
    return base


def test_no_config_keeps_everything() -> None:
    postings = [_posting(), _posting(title="Junior Dev"), _posting(salary_min=50000)]
    assert _apply_post_fetch_filters(postings, {}) == postings


def test_min_salary_drops_below_floor() -> None:
    postings = [
        _posting(salary_min=80000),
        _posting(salary_min=150000),
        _posting(salary_min=200000),
    ]
    result = _apply_post_fetch_filters(postings, {"min_salary_usd": 150000})
    assert len(result) == 2
    assert {p["salary_min"] for p in result} == {150000, 200000}


def test_min_salary_keeps_unknown_salary() -> None:
    """A posting with salary_min=None should NOT be dropped — we don't
    know the salary, so we don't punish the listing for the source not
    disclosing."""
    postings = [_posting(salary_min=None), _posting(salary_min=50000)]
    result = _apply_post_fetch_filters(postings, {"min_salary_usd": 100000})
    assert len(result) == 1
    assert result[0]["salary_min"] is None


def test_excluded_keyword_matches_title() -> None:
    postings = [_posting(title="Junior Software Engineer"), _posting(title="Senior")]
    result = _apply_post_fetch_filters(postings, {"excluded_keywords": ["junior"]})
    assert len(result) == 1
    assert result[0]["title"] == "Senior"


def test_excluded_keyword_matches_company() -> None:
    postings = [
        _posting(company_name="Lockheed Martin"),
        _posting(company_name="Stripe"),
    ]
    result = _apply_post_fetch_filters(
        postings, {"excluded_keywords": ["lockheed"]},
    )
    assert len(result) == 1
    assert result[0]["company_name"] == "Stripe"


def test_excluded_keyword_matches_description() -> None:
    postings = [
        _posting(description="Top secret defense clearance required"),
        _posting(description="Build cool product features"),
    ]
    result = _apply_post_fetch_filters(
        postings, {"excluded_keywords": ["defense"]},
    )
    assert len(result) == 1
    assert "defense" not in result[0]["description"].lower()


def test_excluded_keywords_case_insensitive() -> None:
    postings = [_posting(company_name="LOCKHEED MARTIN")]
    result = _apply_post_fetch_filters(
        postings, {"excluded_keywords": ["lockheed"]},
    )
    assert result == []


def test_excluded_keywords_empty_strings_ignored() -> None:
    """Whitespace-only entries shouldn't accidentally match every posting."""
    postings = [_posting(), _posting(title="Junior")]
    result = _apply_post_fetch_filters(
        postings, {"excluded_keywords": ["  ", "", "junior"]},
    )
    assert len(result) == 1


def test_combined_min_salary_and_excluded_keywords() -> None:
    postings = [
        _posting(title="Junior Eng", salary_min=200000),  # excluded word
        _posting(title="Senior Eng", salary_min=80000),  # below floor
        _posting(title="Senior Eng", salary_min=200000),  # KEEP
        _posting(title="Senior Eng", salary_min=None),  # unknown salary, KEEP
        _posting(title="Senior Eng", company_name="Lockheed Martin"),  # excluded
    ]
    result = _apply_post_fetch_filters(
        postings,
        {"min_salary_usd": 150000, "excluded_keywords": ["junior", "lockheed"]},
    )
    assert len(result) == 2
    titles_companies = [(p["title"], p["company_name"]) for p in result]
    assert ("Senior Eng", "Acme") in titles_companies
    # Both kept rows have title "Senior Eng" — distinguish by salary
    salaries = sorted(
        (p["salary_min"] for p in result),
        key=lambda v: (v is None, v),
    )
    assert salaries == [200000, None]


def test_min_salary_invalid_raw_falls_back_to_no_filter() -> None:
    """If min_salary_usd is a non-numeric value, treat as not configured
    rather than crashing."""
    postings = [_posting(salary_min=10000)]
    result = _apply_post_fetch_filters(
        postings, {"min_salary_usd": "not a number"},
    )
    assert len(result) == 1
