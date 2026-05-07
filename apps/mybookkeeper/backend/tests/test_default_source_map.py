"""Pure-function tests for the placeholder default-source map."""
from __future__ import annotations

from app.services.leases.default_source_map import (
    DEFAULT_SOURCE_MAP,
    PlaceholderDefault,
    get_default,
    guess_input_type_and_default,
)


class TestGetDefault:
    def test_known_text_key(self) -> None:
        d = get_default("TENANT FULL NAME")
        assert d.input_type == "text"
        assert d.default_source == "applicant.legal_name || inquiry.inquirer_name"
        assert d.computed_expr is None

    def test_unknown_key_falls_back_to_text(self) -> None:
        d = get_default("ARBITRARY HOST FIELD")
        assert d.input_type == "text"
        assert d.default_source is None
        assert d.computed_expr is None

    def test_number_of_days_seeds_computed_expr(self) -> None:
        """``NUMBER OF DAYS`` must seed the matching computed-DSL expression."""
        d = get_default("NUMBER OF DAYS")
        assert d.input_type == "computed"
        assert d.default_source is None
        assert d.computed_expr == "(MOVE-OUT DATE - MOVE-IN DATE).days"

    def test_signature_keys_have_no_computed_expr(self) -> None:
        for key in ("LANDLORD SIGNATURE", "TENANT SIGNATURE"):
            d = get_default(key)
            assert d.input_type == "signature"
            assert d.default_source is None
            assert d.computed_expr is None


class TestBackCompatShim:
    def test_returns_input_type_and_default_source(self) -> None:
        input_type, default_source = guess_input_type_and_default("TENANT EMAIL")
        assert input_type == "email"
        assert default_source == "applicant.contact_email || inquiry.inquirer_email"


class TestMapShape:
    def test_every_entry_is_placeholder_default(self) -> None:
        for key, value in DEFAULT_SOURCE_MAP.items():
            assert isinstance(value, PlaceholderDefault), key
