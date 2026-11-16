"""ISO 4217 currency-code validation on the application / profile schemas."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.currency_code import normalize_currency_code
from app.schemas.application.application_create_request import ApplicationCreateRequest
from app.schemas.application.application_update_request import ApplicationUpdateRequest
from app.schemas.profile.profile_update_request import ProfileUpdateRequest

_COMPANY_ID = "00000000-0000-0000-0000-000000000001"


def _create(**overrides: object) -> ApplicationCreateRequest:
    return ApplicationCreateRequest(
        company_id=_COMPANY_ID, role_title="Engineer", **overrides,
    )


class TestNormalizeCurrencyCode:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [("USD", "USD"), ("usd", "USD"), (" cad ", "CAD"), ("eur", "EUR")],
    )
    def test_valid_codes_are_uppercased(self, raw: str, expected: str) -> None:
        assert normalize_currency_code(raw) == expected

    @pytest.mark.parametrize("raw", ["CA$", "US", "USDX", "12A", "€", "", None, 5])
    def test_invalid_values_return_none(self, raw: object) -> None:
        assert normalize_currency_code(raw) is None


class TestApplicationCreateRequestCurrency:
    def test_defaults_to_usd(self) -> None:
        assert _create().posted_salary_currency == "USD"

    def test_lowercase_is_normalized(self) -> None:
        assert _create(posted_salary_currency="cad").posted_salary_currency == "CAD"

    @pytest.mark.parametrize("bad", ["CA$", "U1D", "us", "USDX", "€€€"])
    def test_invalid_code_rejected(self, bad: str) -> None:
        with pytest.raises(ValidationError):
            _create(posted_salary_currency=bad)


class TestApplicationUpdateRequestCurrency:
    def test_lowercase_is_normalized(self) -> None:
        req = ApplicationUpdateRequest(posted_salary_currency="eur")
        assert req.posted_salary_currency == "EUR"

    def test_omitted_is_none(self) -> None:
        assert ApplicationUpdateRequest().posted_salary_currency is None

    def test_invalid_code_rejected(self) -> None:
        with pytest.raises(ValidationError):
            ApplicationUpdateRequest(posted_salary_currency="CA$")


class TestProfileUpdateRequestCurrency:
    def test_lowercase_is_normalized(self) -> None:
        assert ProfileUpdateRequest(salary_currency="gbp").salary_currency == "GBP"

    def test_invalid_code_rejected(self) -> None:
        with pytest.raises(ValidationError):
            ProfileUpdateRequest(salary_currency="CA$")
