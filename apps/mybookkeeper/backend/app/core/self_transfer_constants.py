"""When money that left one of your accounts and money that reached another
are one transfer, though the two amounts differ by a fee."""
from decimal import Decimal
from typing import Final

# A holder's name has to be at least this many words before a description
# containing it is read as money sent to themselves: "Jason" alone would also
# match "Jason's Deli".
SELF_TRANSFER_MIN_NAME_WORDS: Final = 2

# What a transfer service may keep on the way (Wise kept $1.13 of $680): at
# most this much, and at most this share of what was sent. A bigger gap is not
# read as a fee, so the two rows are left as they are.
SELF_TRANSFER_MAX_FEE: Final = Decimal("10.00")
SELF_TRANSFER_MAX_FEE_SHARE: Final = Decimal("0.02")
