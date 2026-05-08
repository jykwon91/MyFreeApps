"""Tests for JSearchSourceConfig — the typed validator that replaced
the loose ``dict[str, Any]`` shape on ``DiscoverySource.config``.

The audit's "DiscoverySource.config is unvalidated" finding (High,
2026-05-07) called out three failure modes the loose dict allowed:

1. **Field typos** silently no-op (e.g. ``min_salary_us`` instead of
   ``min_salary_usd``).
2. **Type errors** fall through (e.g. ``min_salary_usd: "abc"``).
3. **Out-of-enum values** silently dropped (e.g.
   ``excluded_industry_chips: ["not_a_real_chip"]``).

Each of those is now a ValidationError. These tests pin the contract.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.discovery.discovery_schemas import DiscoverySourceCreate
from app.schemas.discovery.jsearch_source_config import JSearchSourceConfig


# ===========================================================================
# JSearchSourceConfig direct
# ===========================================================================


def test_default_config_validates() -> None:
    cfg = JSearchSourceConfig()
    assert cfg.roles == []
    assert cfg.skills == []
    assert cfg.country == "us"
    assert cfg.date_posted == "all"
    assert cfg.remote_jobs_only is False


def test_typed_field_passthrough() -> None:
    cfg = JSearchSourceConfig(
        roles=["Senior Backend Engineer"],
        skills=["Python"],
        location="Remote",
        country="us",
        date_posted="week",
        remote_jobs_only=True,
        employment_type="FULLTIME",
        experience="more_than_3_years_experience",
        min_salary_usd=150000,
        excluded_industry_chips=["government_defense"],
        excluded_keywords=["junior", "intern"],
    )
    assert cfg.min_salary_usd == 150000
    assert cfg.excluded_industry_chips == ["government_defense"]


# ===========================================================================
# Typo / unknown-field rejection — the core fix
# ===========================================================================


def test_unknown_field_raises_validation_error() -> None:
    """The whole point of this PR — ``min_salary_us`` instead of
    ``min_salary_usd`` previously did nothing; now it 422s."""
    with pytest.raises(ValidationError) as exc_info:
        JSearchSourceConfig(min_salary_us=150000)  # type: ignore[call-arg]
    msg = str(exc_info.value)
    assert "min_salary_us" in msg
    assert "extra_forbidden" in msg.lower() or "extra" in msg.lower()


def test_invalid_country_enum_rejects() -> None:
    with pytest.raises(ValidationError):
        JSearchSourceConfig(country="zz")  # type: ignore[arg-type]


def test_invalid_date_posted_enum_rejects() -> None:
    with pytest.raises(ValidationError):
        JSearchSourceConfig(date_posted="next_week")  # type: ignore[arg-type]


def test_invalid_industry_chip_rejects() -> None:
    with pytest.raises(ValidationError):
        JSearchSourceConfig(
            excluded_industry_chips=["not_a_real_chip"],  # type: ignore[list-item]
        )


def test_negative_min_salary_rejects() -> None:
    with pytest.raises(ValidationError):
        JSearchSourceConfig(min_salary_usd=-1)


def test_string_min_salary_rejects() -> None:
    with pytest.raises(ValidationError):
        JSearchSourceConfig(min_salary_usd="not a number")  # type: ignore[arg-type]


# ===========================================================================
# parse_or_default — the lenient fetch-time path
# ===========================================================================


def test_parse_or_default_accepts_None() -> None:
    cfg = JSearchSourceConfig.parse_or_default(None)
    assert cfg.roles == []


def test_parse_or_default_returns_default_on_invalid() -> None:
    """A row in the DB with garbage shouldn't crash the worker."""
    cfg = JSearchSourceConfig.parse_or_default({"min_salary_us": 100000})
    assert cfg.min_salary_usd is None  # default — typo'd field ignored


def test_parse_or_default_passes_through_valid() -> None:
    cfg = JSearchSourceConfig.parse_or_default(
        {"roles": ["Engineer"], "country": "us"},
    )
    assert cfg.roles == ["Engineer"]
    assert cfg.country == "us"


# ===========================================================================
# DiscoverySourceCreate end-to-end — the API boundary
# ===========================================================================


def test_create_with_jsearch_typed_config_passes() -> None:
    body = DiscoverySourceCreate(
        source="jsearch",
        config={
            "roles": ["Senior Backend Engineer"],
            "country": "us",
            "date_posted": "week",
        },
    )
    assert body.source == "jsearch"
    assert body.config["roles"] == ["Senior Backend Engineer"]


def test_create_with_jsearch_typo_in_config_raises_422_field() -> None:
    """A POST /discover/sources with a typo'd field should 422 with
    the offending field in the error message."""
    with pytest.raises(ValidationError) as exc_info:
        DiscoverySourceCreate(
            source="jsearch",
            config={"min_salary_us": 100000},  # typo
        )
    assert "min_salary_us" in str(exc_info.value)


def test_create_with_non_jsearch_source_skips_strict_validation() -> None:
    """RemoteOK / Greenhouse / Lever / etc. don't have adapters wired
    yet, so loose dict is OK for those source kinds."""
    body = DiscoverySourceCreate(
        source="remoteok",
        config={"any_random_field": "value"},
    )
    assert body.source == "remoteok"
