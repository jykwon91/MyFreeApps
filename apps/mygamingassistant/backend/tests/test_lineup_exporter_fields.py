"""Unit tests for lineup_exporter's field-list constants.

Focused on the ``landing_screenshot_url`` addition (preview-stills PR): it
must appear in BOTH ``LINEUP_SCALAR_FIELDS`` (so the pack carries the value)
AND ``PUBLIC_OBJECT_KEY_FIELDS`` (so ``publish_clips_to_r2`` ships the object
from local MinIO to R2, mirroring the existing stand/aim screenshot keys).
"""
from __future__ import annotations

from app.services.game.lineup_exporter import (
    LINEUP_SCALAR_FIELDS,
    PUBLIC_OBJECT_KEY_FIELDS,
)


def test_landing_screenshot_url_in_scalar_fields():
    assert "landing_screenshot_url" in LINEUP_SCALAR_FIELDS


def test_landing_screenshot_url_in_public_object_key_fields():
    assert "landing_screenshot_url" in PUBLIC_OBJECT_KEY_FIELDS


def test_public_object_key_fields_is_subset_of_scalar_fields():
    """Every public object key must also be carried in the pack's scalar
    fields — a key that's shipped to R2 but not exported would leave the
    pack pointing at an object nobody ever gets a URL for."""
    assert set(PUBLIC_OBJECT_KEY_FIELDS).issubset(set(LINEUP_SCALAR_FIELDS))


def test_public_object_key_fields_has_seven_entries():
    """Pins the count so a future addition/removal updates this test
    deliberately rather than silently drifting the '7 public object keys'
    doc comment out of sync with the tuple."""
    assert len(PUBLIC_OBJECT_KEY_FIELDS) == 7
