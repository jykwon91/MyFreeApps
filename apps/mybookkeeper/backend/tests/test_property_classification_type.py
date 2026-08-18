"""The classification/type invariant that ``chk_prop_classification_type`` enforces.

Reclassifying a short-term rental as a primary residence used to return a 500
from ``PATCH /properties/{id}``: the request carried a new classification but no
``type``, the service wrote it straight through, and the database rejected the
``(PRIMARY_RESIDENCE, SHORT_TERM)`` pair. These tests pin the reconciliation so
the constraint stays unreachable from the API.
"""

import pytest

from app.models.properties.property import PropertyType, reconcile_type
from app.models.properties.property_classification import PropertyClassification
from app.models.requests.property_create import PropertyCreate

INVESTMENT = PropertyClassification.INVESTMENT
PRIMARY = PropertyClassification.PRIMARY_RESIDENCE
SECOND_HOME = PropertyClassification.SECOND_HOME
UNCLASSIFIED = PropertyClassification.UNCLASSIFIED

SHORT_TERM = PropertyType.SHORT_TERM
LONG_TERM = PropertyType.LONG_TERM


@pytest.mark.parametrize("stale_type", [SHORT_TERM, LONG_TERM, None])
@pytest.mark.parametrize("personal", [PRIMARY, SECOND_HOME])
def test_personal_classifications_clear_the_rental_type(personal, stale_type):
    """A home you live in has no rental type, whatever was stored before."""
    assert reconcile_type(personal, stale_type) is None


def test_investment_keeps_an_explicit_rental_type():
    assert reconcile_type(INVESTMENT, LONG_TERM) is LONG_TERM


def test_investment_without_a_type_falls_back_to_short_term():
    """The constraint requires a non-null type, so one has to be chosen."""
    assert reconcile_type(INVESTMENT, None) is SHORT_TERM


@pytest.mark.parametrize("any_type", [SHORT_TERM, LONG_TERM, None])
def test_unclassified_is_left_alone(any_type):
    """The constraint permits either, so an unclassified row keeps what it had."""
    assert reconcile_type(UNCLASSIFIED, any_type) is any_type


def test_create_request_still_reconciles():
    """PropertyCreate delegates to the same rule rather than repeating it."""
    created = PropertyCreate(
        name="6734 Peerless", address="6734 Peerless St", classification=PRIMARY,
        type=SHORT_TERM,
    )
    assert created.type is None


def test_create_request_defaults_an_investment_type():
    created = PropertyCreate(
        name="6738 Peerless", address="6738 Peerless St", classification=INVESTMENT,
    )
    assert created.type is SHORT_TERM
