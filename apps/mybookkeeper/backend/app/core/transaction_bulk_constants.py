"""Transaction bulk-operation limits."""

# Upper bound on ids accepted by the POST /transactions/bulk-* routes.
# Mirrored by MAX_BULK_TRANSACTION_IDS in the api-client.
MAX_BULK_TRANSACTION_IDS = 500
