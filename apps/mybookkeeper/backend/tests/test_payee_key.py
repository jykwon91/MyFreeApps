"""The one payee key: the payee without the payment app's prefix or the payment reference.

Monthly expenses groups on it, and loan payees and payee rules are stored and matched on it.
"""
import pytest

from app.core.payee_keys import WORD_START, payee_key, payee_name
from app.core.vendors import normalize_vendor


def _key(descriptor: str | None) -> str | None:
    return payee_key(descriptor, None)


class TestPaymentReferencesAreLeftOut:
    @pytest.mark.parametrize(
        "descriptor,key",
        [
            # Chase Zelle: a reference number, then a confirmation id.
            ("Zelle payment to Silvia 29520127614", "silvia"),
            ("Zelle payment to Silvia 31715789323", "silvia"),
            ("Zelle payment to Jason Lawn Guy JPM99cjlb7cn", "jason lawn guy"),
            ("Zelle payment to Silvia - conf 99812", "silvia"),
            # Chase ACH: a reference before the company ID cuts there.
            ("GEICO PAYMENT 0123456789 PPD ID: 1234567890", "geico payment"),
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
        assert _key(descriptor) == key

    def test_every_payment_to_one_payee_shares_a_key_whatever_the_app(self) -> None:
        assert (
            _key("Zelle payment to Silvia 29520127614")
            == _key("Zelle payment to Silvia 31715789323")
            == _key("zelle payment to silvia")
            == _key("Venmo to Silvia")
            == _key("Silvia")
        )

    def test_the_key_of_a_key_is_itself(self) -> None:
        for descriptor in ("Zelle payment to Silvia 29520127614", "WAL-MART #1234 HOUSTON TX", "7-ELEVEN #33155"):
            key = _key(descriptor)
            assert key is not None
            assert _key(key) == key

    @pytest.mark.parametrize(
        "descriptor",
        [
            "Zelle payment to Jason Lawn Guy JPM99cjlb7cn",
            "GEICO PAYMENT 0123456789 PPD ID: 1234567890",
            "CITY OF HOUSTON WATER PPD ID: 1746001790",
            "SHELL OIL 57444123 HOUSTON TX",
            "AMZN Mktp US*2K3AB1C",
            "Wal-Mart #1234",
        ],
    )
    def test_the_key_starts_a_word_of_the_descriptor_so_a_rule_on_it_matches(self, descriptor: str) -> None:
        key = _key(descriptor)
        assert key is not None
        assert WORD_START + key in WORD_START + normalize_vendor(descriptor)


class TestTheAchCompanyIdNamesThePayee:
    @pytest.mark.parametrize(
        "descriptor,key",
        [
            ("CITY OF HOUSTON WATER PPD ID: 1746001790", "city of houston water ppd id: 1746001790"),
            ("ACME RENT PORTAL WEB ID: 9800012345", "acme rent portal web id: 9800012345"),
            ("ACME RENT PORTAL WEB ID:9800012345", "acme rent portal web id:9800012345"),
            ("JPMORGAN CHASE CHASE ACH PPD", "jpmorgan chase chase ach ppd"),
        ],
    )
    def test_kept(self, descriptor: str, key: str) -> None:
        assert _key(descriptor) == key

    def test_one_company_under_two_ids_is_two_payees(self) -> None:
        # Chase's own ACH: the mortgage under one ID, a card under another.
        assert _key("JPMORGAN CHASE CHASE ACH PPD ID: 1000008113") != _key("JPMORGAN CHASE CHASE ACH PPD ID: 9200000002")
        # Money taken from the account holder's external account by two different companies.
        assert _key("Jason Kwon External F Jason Kwon WEB ID: 1313185515") != _key(
            "Jason Kwon External F Jason Kwon WEB ID: 9999999999",
        )


class TestTheOperatorsLoanPayeesSurvive:
    """The three loan payees tagged in production, by the payee name they were tagged with."""

    @pytest.mark.parametrize(
        "tagged,key,a_later_payment",
        [
            (
                "Jason Kwon External F Jason Kwon WEB ID: 1313185515",
                "jason kwon external f jason kwon web id: 1313185515",
                "JASON KWON  EXTERNAL F jason kwon WEB ID: 1313185515",
            ),
            (
                "JPMORGAN CHASE CHASE ACH PPD ID: 1000008113",
                "jpmorgan chase chase ach ppd id: 1000008113",
                "JPMORGAN CHASE CHASE ACH PPD ID: 1000008113",
            ),
            ("Toyota Financial Services", "toyota financial services", "TOYOTA FINANCIAL SERVICES"),
        ],
    )
    def test_the_tag_and_every_payment_share_a_key(self, tagged: str, key: str, a_later_payment: str) -> None:
        assert _key(tagged) == key
        assert payee_key(None, a_later_payment) == key

    @pytest.mark.parametrize(
        "tagged",
        [
            "Jason Kwon External F Jason Kwon WEB ID: 1313185515",
            "JPMORGAN CHASE CHASE ACH PPD ID: 1000008113",
            "Toyota Financial Services",
        ],
    )
    def test_the_stored_key_is_unchanged_by_the_re_key(self, tagged: str) -> None:
        # The key they were stored under: the name case-folded with whitespace collapsed.
        assert _key(tagged) == " ".join(tagged.split()).casefold()


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
        assert _key(descriptor) == key

    def test_payees_told_apart_by_their_digits_keep_distinct_keys(self) -> None:
        keys = {_key(name) for name in ("7-Eleven", "Eleven", "24 Hour Fitness", "Hour Fitness", "Union 76", "Union")}
        assert len(keys) == 6

    def test_blank_names_nobody(self) -> None:
        assert _key(None) is None
        assert _key("   ") is None


class TestPayeeName:
    def test_shown_as_spelled_without_the_app_or_the_reference(self) -> None:
        assert payee_name("Zelle payment to Silvia 29520127614", None) == "Silvia"
        assert payee_name(None, "JPMORGAN CHASE CHASE ACH PPD ID: 1000008113") == "JPMORGAN CHASE CHASE ACH PPD ID: 1000008113"
        assert payee_name("HOME DEPOT #6512", None) == "HOME DEPOT"

    def test_a_payment_that_names_nobody(self) -> None:
        assert payee_name(None, None) == "Unknown payee"
