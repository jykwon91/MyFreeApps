"""Transaction bulk-operation limits."""

# Upper bound on ids accepted by POST /transactions/bulk-approve and /bulk-delete.
# Mirrored by MAX_BULK_TRANSACTION_IDS in the api-client.
MAX_BULK_TRANSACTION_IDS = 500
