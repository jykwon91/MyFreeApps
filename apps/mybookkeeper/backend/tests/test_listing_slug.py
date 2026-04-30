"""Pure-function tests for the public-form slug generator (T0)."""
from __future__ import annotations

from app.services.listings import listing_slug


class TestSlugifyTitle:
    def test_basic_title(self) -> None:
        slug = listing_slug.generate_slug("Master Bedroom in Houston")
        # ``master-bedroom-in-houston`` plus 6-char suffix
        prefix, suffix = slug.rsplit("-", 1)
        assert prefix == "master-bedroom-in-houston"
        assert listing_slug.is_valid_suffix(suffix)

    def test_strips_diacritics(self) -> None:
        slug = listing_slug.generate_slug("María's Suite")
        prefix, _suffix = slug.rsplit("-", 1)
        # ``maria-s-suite`` — diacritic stripped, apostrophe → ``-``
        assert prefix == "maria-s-suite"

    def test_collapses_punctuation(self) -> None:
        slug = listing_slug.generate_slug("Apt #3 — Furnished!!!")
        prefix, _suffix = slug.rsplit("-", 1)
        assert prefix == "apt-3-furnished"

    def test_pathological_title_falls_back_to_listing(self) -> None:
        slug = listing_slug.generate_slug("🏠🏠🏠")
        prefix, suffix = slug.rsplit("-", 1)
        assert prefix == "listing"
        assert listing_slug.is_valid_suffix(suffix)

    def test_long_title_truncated(self) -> None:
        long_title = "Bedroom " + "very-" * 100  # ~520 chars
        slug = listing_slug.generate_slug(long_title)
        # Total slug length stays within reasonable limits.
        assert len(slug) <= listing_slug.SLUG_MAX_LENGTH


class TestRandomSuffix:
    def test_suffix_format(self) -> None:
        slug = listing_slug.generate_slug("Test")
        suffix = slug.rsplit("-", 1)[1]
        assert listing_slug.is_valid_suffix(suffix)
        assert len(suffix) == listing_slug.SUFFIX_LENGTH

    def test_suffixes_are_distinct(self) -> None:
        # 50 random suffixes — collision rate at 32^6 keyspace is astronomically
        # low, so we expect 50/50 unique.
        suffixes = {listing_slug.generate_slug("x").rsplit("-", 1)[1] for _ in range(50)}
        assert len(suffixes) == 50

    def test_invalid_suffix_rejected(self) -> None:
        assert listing_slug.is_valid_suffix("ABCDEF") is False  # uppercase
        assert listing_slug.is_valid_suffix("abc1l0") is False  # excluded chars
        assert listing_slug.is_valid_suffix("short") is False
        assert listing_slug.is_valid_suffix("toolongstring") is False
