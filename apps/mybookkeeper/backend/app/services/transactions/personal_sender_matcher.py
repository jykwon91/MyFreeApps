"""Whether a payment comes from a sender the person marked as personal.

Pure: no database, no session. A remembered sender matches a payment when the
names are the same and the handles don't contradict each other. An empty
handle on either side is no evidence either way, so it is compatible with any
handle. Two different non-empty handles mean two different people who share a
name, so that is not a match and the payment goes to review as usual.

With more than one remembered row for a name (one without a handle, one
with), any compatible row matches: every row leads to the same outcome, so
the order they are checked in can't change the result.
"""
from collections.abc import Sequence

from app.core.personal_sender_keys import normalize_sender_handle, normalize_sender_name
from app.models.transactions.personal_transfer_sender import PersonalTransferSender


def handles_compatible(stored_handle: str, incoming_handle: str) -> bool:
    return not stored_handle or not incoming_handle or stored_handle == incoming_handle


def sender_matches(
    sender: PersonalTransferSender, *, payer_name: str | None, payer_handle: str | None,
) -> bool:
    name = normalize_sender_name(payer_name)
    if not name or name != sender.normalized_payer_name:
        return False
    return handles_compatible(sender.payer_handle, normalize_sender_handle(payer_handle))


def find_matching_sender(
    senders: Sequence[PersonalTransferSender], *, payer_name: str | None, payer_handle: str | None,
) -> PersonalTransferSender | None:
    return next(
        (s for s in senders if sender_matches(s, payer_name=payer_name, payer_handle=payer_handle)),
        None,
    )
