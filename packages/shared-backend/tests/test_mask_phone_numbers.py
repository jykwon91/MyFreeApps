"""Phone numbers are hidden in text that is logged or shown, and nothing else is."""
import pytest

from platform_shared.core.mask_phone_numbers import mask_phone_numbers


@pytest.mark.parametrize(
    "text,masked",
    [
        ("Invalid 'To' Phone Number: +15559876543", "Invalid 'To' Phone Number: [phone number]"),
        ("Invalid 'To' Phone Number: +1 555-987-6543", "Invalid 'To' Phone Number: [phone number]"),
        ("call (713) 555-0100 now", "call [phone number] now"),
        ("to 713.555.0100.", "to [phone number]."),
        ("to 7135550100", "to [phone number]"),
        ("to:5125550199", "to:[phone number]"),
        ("phone_5125550199 rejected", "phone_[phone number] rejected"),
        ("To=+15125550199", "To=[phone number]"),
        ("+44 20 7946 0958 and +15559876543", "[phone number] and [phone number]"),
        ("on 2026-11-21 to +15559876543", "on 2026-11-21 to [phone number]"),
    ],
)
def test_phone_numbers_are_masked(text: str, masked: str) -> None:
    assert mask_phone_numbers(text) == masked


@pytest.mark.parametrize(
    "text",
    [
        "code 21211",
        "status 400",
        "Attempt 3 of 5",
        "",
        "due 2026-11-21",
        "from 192.168.1.10",
        "from 192.168.100.100",
        "at 10:30:00",
        "at 2026-11-21T10:30:00Z",
        "id 12345678901234567890",
        "id_12345678901234567890",
        "at 10:30:00.1234567890",
        "v1.5125550199",
        "id +12345678901234567890",
        "message 3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c",
    ],
)
def test_other_numbers_are_left_alone(text: str) -> None:
    assert mask_phone_numbers(text) == text
