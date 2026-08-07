"""Metered-usage constants.

A utility bill prices a *quantity*. Storing only the dollar amount makes the
bill incomparable — across months, across properties, and against the rate the
contract claims. The Peerless St plans advertise 13.9 c/kWh; the real blended
rate across 39 bills is 15.93 c/kWh, and nothing in the schema could show that
because no row recorded how many kWh the money bought.

``USAGE_UNITS`` is enforced in the DB by ``CheckConstraint`` (String + CHECK,
never the SQLAlchemy ``Enum`` type, per the monorepo schema conventions) and is
mirrored as a TypeScript union in
``frontend/src/shared/types/utility/utility-usage-unit.ts`` — a value added here
MUST be added there in the same PR.

Units are stored exactly as the bill states them rather than normalized on the
way in, so a stored row always matches its source document. ``USAGE_UNIT_FAMILY``
is what makes them comparable after the fact.
"""

USAGE_UNIT_KWH = "kwh"
USAGE_UNIT_THERM = "therm"
USAGE_UNIT_CCF = "ccf"
USAGE_UNIT_MCF = "mcf"
USAGE_UNIT_GALLON = "gallon"
# Thousands of gallons — how most municipal water bills (including Houston)
# state consumption. Keeping it distinct from ``gallon`` is not pedantry: a bill
# reading "12" under a "1,000 GAL" heading stored as ``gallon`` is wrong by
# 1000x, which is the same class of silent error this table exists to expose.
USAGE_UNIT_KGAL = "kgal"

USAGE_UNITS: frozenset[str] = frozenset({
    USAGE_UNIT_KWH,
    USAGE_UNIT_THERM,
    USAGE_UNIT_CCF,
    USAGE_UNIT_MCF,
    USAGE_UNIT_GALLON,
    USAGE_UNIT_KGAL,
})

# Units that may be aggregated together. Summing a quantity across families
# produces a confident, meaningless number — 900 kWh plus 40 therms is not 940
# of anything — so any aggregate must group by family (or by unit) rather than
# summing the raw column.
USAGE_UNIT_FAMILY: dict[str, str] = {
    USAGE_UNIT_KWH: "energy",
    USAGE_UNIT_THERM: "gas",
    USAGE_UNIT_CCF: "gas",
    USAGE_UNIT_MCF: "gas",
    USAGE_UNIT_GALLON: "water",
    USAGE_UNIT_KGAL: "water",
}
