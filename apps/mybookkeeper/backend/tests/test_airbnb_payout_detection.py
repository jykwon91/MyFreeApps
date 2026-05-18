"""Regression tests for Airbnb payout detection.

Before this fix the trigger keyed off ``gmail_labels``, which the email
worker never populated, AND the extraction prompt deliberately nulls
``payer_name`` for platform payouts — so ``_is_airbnb_payout`` was always
False and ``_attribute_airbnb_payout`` was unreachable. Airbnb payouts were
never attributed to a property. These tests pin the structured-extraction
detector that replaced the dead label signal.
"""
import pytest

from app.services.extraction.extraction_persistence import _is_airbnb_payout


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        # The exact shape the prompt emits for an Airbnb payout
        # (prompts/base_prompt.py:308) — this used to evaluate False.
        (
            {
                "vendor": "Airbnb",
                "amount": "850.00",
                "channel": "airbnb",
                "category": "rental_revenue",
                "payment_method": "platform_payout",
                "payer_name": None,
            },
            True,
        ),
        # Channel airbnb + rental_revenue is enough.
        ({"channel": "airbnb", "category": "rental_revenue"}, True),
        # Channel airbnb + platform_payout is enough.
        ({"channel": "airbnb", "payment_method": "platform_payout"}, True),
        # Case / whitespace tolerant.
        ({"channel": " Airbnb ", "category": " RENTAL_REVENUE "}, True),
        # Airbnb channel but neither payout- nor revenue-shaped → not a payout.
        ({"channel": "airbnb", "category": "cleaning_fee_revenue"}, False),
        ({"channel": "airbnb"}, False),
        # Other channels never match.
        ({"channel": "vrbo", "category": "rental_revenue"}, False),
        ({"channel": "booking.com", "payment_method": "platform_payout"}, False),
        # No channel → not an Airbnb payout.
        ({"category": "rental_revenue", "payment_method": "platform_payout"}, False),
        ({"channel": None, "category": "rental_revenue"}, False),
        ({}, False),
        # Malformed Claude output must degrade to False, never raise.
        ({"channel": ["airbnb"], "category": "rental_revenue"}, False),
        ({"channel": 123}, False),
        # A bad non-string field is neutralized, not fatal: a valid airbnb
        # channel + valid payment_method still detects despite a junk category.
        (
            {"channel": "airbnb", "category": ["junk"], "payment_method": "platform_payout"},
            True,
        ),
        # A Cash App / Venmo P2P transfer carries payment_method
        # "platform_payout" but no channel — must NOT be routed as Airbnb.
        (
            {
                "vendor": "Cash App",
                "channel": None,
                "payment_method": "platform_payout",
                "category": "rental_revenue",
                "payer_name": "Jane Smith",
            },
            False,
        ),
    ],
)
def test_is_airbnb_payout(data: dict, expected: bool) -> None:
    assert _is_airbnb_payout(data) is expected  # type: ignore[arg-type]
