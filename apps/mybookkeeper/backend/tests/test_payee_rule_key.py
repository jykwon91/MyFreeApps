"""The payee key a vendor rule is learned and matched on: a descriptor without its payment reference."""
import pytest

from app.core.payee_keys import payee_rule_key
from app.core.vendors import normalize_vendor


class TestPaymentReferencesAreLeftOut:
    @pytest.mark.parametrize(
        "descriptor,key",
        [
            # Chase Zelle: a reference number, then a confirmation id.
            ("Zelle payment to Silvia 29520127614", "zelle payment to silvia"),
            ("Zelle payment to Silvia 31715789323", "zelle payment to silvia"),
            ("Zelle payment to Jason Lawn Guy JPM99cjlb7cn", "zelle payment to jason lawn guy"),
            ("Zelle payment to Silvia - conf 99812", "zelle payment to silvia"),
            # Chase ACH.
            ("GEICO PAYMENT 0123456789 PPD ID: 1234567890", "geico payment"),
            ("CITY OF HOUSTON WATER PPD ID: 1746001790", "city of houston water"),
            ("ACME RENT PORTAL WEB ID: 9800012345", "acme rent portal"),
            ("ACME HOA REF# 4471 PPD ID: 1234567890", "acme hoa"),
            # Card descriptors with store numbers.
            ("HOME DEPOT #6512", "home depot"),
            ("WAL-MART #1234 HOUSTON TX", "wal-mart"),
            ("SHELL OIL 57444123 HOUSTON TX", "shell oil"),
            ("STARBUCKS STORE 01234", "starbucks store"),
            ("MCDONALDS F1234", "mcdonalds"),
            ("TARGET T-1234", "target"),
            ("AMZN Mktp US*2K3AB1C", "amzn mktp us"),
        ],
    )
    def test_the_reference_is_cut_off(self, descriptor: str, key: str) -> None:
        assert payee_rule_key(descriptor) == key

    def test_every_payment_to_one_payee_shares_a_key(self) -> None:
        assert payee_rule_key("Zelle payment to Silvia 29520127614") == payee_rule_key(
            "Zelle payment to Silvia 31715789323",
        ) == payee_rule_key("zelle payment to silvia")

    @pytest.mark.parametrize(
        "descriptor",
        [
            "Zelle payment to Jason Lawn Guy JPM99cjlb7cn",
            "GEICO PAYMENT 0123456789 PPD ID: 1234567890",
            "SHELL OIL 57444123 HOUSTON TX",
            "AMZN Mktp US*2K3AB1C",
            "Wal-Mart #1234",
        ],
    )
    def test_the_key_is_a_prefix_of_the_descriptor_so_a_rule_on_it_matches(self, descriptor: str) -> None:
        assert normalize_vendor(descriptor).startswith(payee_rule_key(descriptor))


class TestDigitsThatNameThePayeeStay:
    @pytest.mark.parametrize(
        "descriptor,key",
        [
            ("7-Eleven", "7-eleven"),
            ("7-ELEVEN #33155", "7-eleven"),
            ("24 Hour Fitness", "24 hour fitness"),
            ("24 Hour Fitness USA 0412", "24 hour fitness usa"),
            ("Studio 54", "studio 54"),
            ("Union 76 1234", "union 76"),
            ("Route 66 Diner", "route 66 diner"),
            ("1-800-Flowers.com 12345", "1-800-flowers.com"),
            ("Uber *Trip", "uber *trip"),
        ],
    )
    def test_kept(self, descriptor: str, key: str) -> None:
        assert payee_rule_key(descriptor) == key

    def test_payees_told_apart_by_their_digits_keep_distinct_keys(self) -> None:
        keys = {payee_rule_key(name) for name in ("7-Eleven", "Eleven", "24 Hour Fitness", "Hour Fitness", "Union 76", "Union")}
        assert len(keys) == 6

    def test_blank_is_empty(self) -> None:
        assert payee_rule_key(None) == ""
        assert payee_rule_key("   ") == ""
