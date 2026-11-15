"""How many rows one page of GET /transactions/page holds. The api-client's TRANSACTION_PAGE_SIZE asks for the default."""

DEFAULT_TRANSACTION_PAGE_SIZE = 50
MAX_TRANSACTION_PAGE_SIZE = 500

# GET /transactions (the phone's list) returns one capped batch rather than counted pages.
DEFAULT_TRANSACTION_LIST_LIMIT = 1000
MAX_TRANSACTION_LIST_LIMIT = 5000
