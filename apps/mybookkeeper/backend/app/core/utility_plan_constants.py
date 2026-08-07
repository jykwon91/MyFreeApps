"""Utility-plan constants.

A utility *plan* is the contract behind a utility account: the rate, the term,
and — the part that costs money when nobody is watching — the date the term
ends. When a fixed-rate term lapses without a renewal, deregulated providers
move the account onto a month-to-month holdover product whose price is not
fixed and can move every billing cycle. Nothing in the monthly "bill is ready"
notification says this happened, so the overpay is silent and open-ended.

``SERVICE_TYPES`` and ``RATE_TYPES`` are enforced in the DB by
``CheckConstraint`` (String + CHECK, never the SQLAlchemy ``Enum`` type, per
the monorepo schema conventions). Both are mirrored as TypeScript unions in
``frontend/src/shared/types/utility/`` — a value added here MUST be added there
in the same PR.
"""

# Utility service a plan covers. ``regulated`` markets (Houston natural gas,
# most municipal water) still get a row: the renewal alert is meaningless for
# them, but the rate and account details are still worth recording, and
# ``RATE_TYPE_REGULATED`` is what suppresses the alert.
SERVICE_TYPE_ELECTRICITY = "electricity"
SERVICE_TYPE_NATURAL_GAS = "natural_gas"
SERVICE_TYPE_WATER = "water"
SERVICE_TYPE_INTERNET = "internet"

SERVICE_TYPES: frozenset[str] = frozenset({
    SERVICE_TYPE_ELECTRICITY,
    SERVICE_TYPE_NATURAL_GAS,
    SERVICE_TYPE_WATER,
    SERVICE_TYPE_INTERNET,
})

# How the price is set.
#   fixed     — locked ¢/kWh for the term; the only type with a real renewal cliff
#   variable  — provider may reprice monthly (this is where a lapsed fixed plan lands)
#   indexed   — tied to a published market index
#   regulated — tariffed monopoly rate; there is no competing supplier to switch to
RATE_TYPE_FIXED = "fixed"
RATE_TYPE_VARIABLE = "variable"
RATE_TYPE_INDEXED = "indexed"
RATE_TYPE_REGULATED = "regulated"

RATE_TYPES: frozenset[str] = frozenset({
    RATE_TYPE_FIXED,
    RATE_TYPE_VARIABLE,
    RATE_TYPE_INDEXED,
    RATE_TYPE_REGULATED,
})

# Rate types whose term genuinely ends on a date the operator must act before.
# A ``regulated`` plan has no competitor to switch to, and a ``variable`` plan
# has already lapsed — alerting on either is noise, so only these are eligible
# for the expiring-soon surface.
RENEWABLE_RATE_TYPES: frozenset[str] = frozenset({
    RATE_TYPE_FIXED,
    RATE_TYPE_INDEXED,
})

# Days of lead time on the expiring-soon surface. 45 days clears the 30-day
# statutory notice window Texas REPs work to (16 TAC 25.475) and still leaves
# room to shop, sign, and let the switch land on the next meter read.
EXPIRING_SOON_DAYS = 45

# Derived, never stored — computed from rate_type + term_end_date + today by
# ``utility_plan_service.renewal_status`` so it can never drift from the dates
# it describes. Mirrored as a TS union in
# ``frontend/src/shared/types/utility/utility-plan-renewal-status.ts``.
#   not_applicable — no term to lapse (regulated, or no end date recorded)
#   active         — term ends beyond the alert window
#   expiring_soon  — term ends within EXPIRING_SOON_DAYS; act now
#   expired        — term end has passed; the account is almost certainly on a
#                    holdover variable rate and bleeding money quietly
RENEWAL_STATUS_NOT_APPLICABLE = "not_applicable"
RENEWAL_STATUS_ACTIVE = "active"
RENEWAL_STATUS_EXPIRING_SOON = "expiring_soon"
RENEWAL_STATUS_EXPIRED = "expired"

RENEWAL_STATUSES: frozenset[str] = frozenset({
    RENEWAL_STATUS_NOT_APPLICABLE,
    RENEWAL_STATUS_ACTIVE,
    RENEWAL_STATUS_EXPIRING_SOON,
    RENEWAL_STATUS_EXPIRED,
})

# Statuses that warrant surfacing to the operator without being asked.
ACTIONABLE_RENEWAL_STATUSES: frozenset[str] = frozenset({
    RENEWAL_STATUS_EXPIRING_SOON,
    RENEWAL_STATUS_EXPIRED,
})

# Providers whose Texas service is a regulated monopoly, offered as UI hints so
# the operator is not sent shopping for an alternative that does not exist.
# Not enforced — an operator outside these markets can record any provider.
REGULATED_TX_GAS_PROVIDERS: frozenset[str] = frozenset({
    "centerpoint",
    "atmos",
    "texas gas service",
})
