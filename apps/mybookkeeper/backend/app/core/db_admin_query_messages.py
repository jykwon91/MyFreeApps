"""Fixed replies for the admin read-only query tool."""
from typing import Final

SELECT_ONLY_MESSAGE: Final = "Only SELECT queries are allowed"

# The driver raises ValueError when a row holds a value Python can't represent
# (``'10000-01-01'::date``, an out-of-range timestamp). Its text quotes the
# value, so the reply says this instead.
UNREADABLE_RESULT_MESSAGE: Final = "Query result contains values that can't be displayed"
