import uuid
from collections.abc import Collection, Sequence


def is_exact_permutation(requested: Sequence[uuid.UUID], current: Collection[uuid.UUID]) -> bool:
    """True only when ``requested`` lists every current id exactly once.

    This is the strict reorder rule: an unknown id, an id of another parent, a
    duplicate or a partial list is not a permutation, and the caller answers 409
    (the client's copy of the list is stale) rather than guessing an order.
    """
    return len(requested) == len(current) and set(requested) == set(current)
