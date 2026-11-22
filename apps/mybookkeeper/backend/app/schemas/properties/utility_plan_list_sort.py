from enum import StrEnum


class UtilityPlanListSort(StrEnum):
    """Orders ``GET /utility-plans`` can be asked for. Mirrored in ``api-client/src/types/utility/utility-plan-list-sort.ts``."""

    RECENT = "recent"
    """Newest term first (the default): each property's current plan leads its group."""

    RENEWAL = "renewal"
    """What needs renewing first: lapsed, then ending soon, then later, then no term, then past plans."""
