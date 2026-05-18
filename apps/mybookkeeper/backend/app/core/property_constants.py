"""Property-aggregation constants.

Transactions whose property attribution could not be resolved (e.g. an Airbnb
payout when the user has zero or multiple matching listings) keep
``property_id = NULL`` and are queued for manual review. They are still real
revenue/expenses, so dashboard aggregations group them under a synthetic
"Unassigned" bucket instead of dropping them.

``UNASSIGNED_PROPERTY_ID`` is the sentinel string used in API responses where a
real property UUID would otherwise appear. The frontend mirrors this value
(``shared/lib/constants.ts``) to route the drill-down at the
``GET /transactions?unassigned=true`` endpoint — keep both in sync.
"""

UNASSIGNED_PROPERTY_ID = "unassigned"
UNASSIGNED_PROPERTY_NAME = "Unassigned"
