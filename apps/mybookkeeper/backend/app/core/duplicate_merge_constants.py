"""What a duplicate merge or "keep this one" carries over from the rows it removes.

The removed row is soft-deleted, so anything only it held is lost unless the
surviving row takes it. Each group below moves as a unit, keyed on its first
field: a tenant link moves with how it was established, a capital improvement
with its placed-in-service date, and the paired usage and service-period
columns together, so no check constraint sees half a pair.

A group moves only when the survivor's key field is empty. When both rows hold
different values for a field in ``CONFLICTING_LINK_LABELS``, neither is picked:
choosing silently would drop a tenant's payment from their rent ledger, or a
vendor's from their history, so the merge is refused instead.
"""

CARRY_OVER_FIELD_GROUPS: tuple[tuple[str, ...], ...] = (
    ("applicant_id", "attribution_source"),
    ("vendor_id",),
    ("activity_id",),
    ("is_capital_improvement", "placed_in_service_date"),
    ("tax_relevant",),
    ("sub_category",),
    ("usage_quantity", "usage_unit"),
    ("service_period_start", "service_period_end"),
    ("payer_name",),
    ("payer_handle",),
    ("address",),
)

# Plural nouns, as they read in "linked to different <label>".
CONFLICTING_LINK_LABELS: dict[str, str] = {
    "applicant_id": "tenants",
    "vendor_id": "vendors",
    "activity_id": "activities",
}
