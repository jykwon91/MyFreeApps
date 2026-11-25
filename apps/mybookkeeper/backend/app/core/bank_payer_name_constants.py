"""What a bank row's description says about who sent the money.

Used by ``services/transactions/bank_payer_name_parser``. A bank describes an
incoming person-to-person payment in its own words; these are the shapes the
connected banks use, seen on synced rows:

* Chase Zelle: ``Zelle payment from SONU KING 31731713019`` (reference last)
* Zelle alerts and other banks: ``Zelle from Sonu King — memo: rent``
* Wise: ``Nicole Santos Felix ()`` — the sender's full name, then brackets
"""
import re
from typing import Final

# "Zelle payment from", "Zelle transfer from", "Zelle from" — then the sender.
ZELLE_FROM_PATTERN: Final = re.compile(
    r"^\s*zelle(?:\s+(?:payment|transfer))?\s+from\s+(?P<name>.+)$", re.IGNORECASE,
)

# Wise: the sender's name followed by a bracketed part, empty or not.
NAME_THEN_BRACKETS_PATTERN: Final = re.compile(r"^\s*(?P<name>[^()]+?)\s*\([^()]*\)\s*$")

# Where the sender's name ends and a memo, note or reference begins.
NAME_TERMINATOR_PATTERN: Final = re.compile(
    r"\s+[—–-]\s+|[:;|#,]|\s+(?:for|memo|on|conf(?:irmation)?|ref(?:erence)?)\b",
    re.IGNORECASE,
)

# A word that can be part of a person's name: letters, with inner ' . -
NAME_WORD_PATTERN: Final = re.compile(r"^[^\W\d_]+(?:['.-][^\W\d_]+)*\.?$")

# A bracketed description is only read as a name when it looks like one:
# two to five name words, none of them a banking word.
BRACKETED_NAME_MIN_WORDS: Final = 2
BRACKETED_NAME_MAX_WORDS: Final = 5
NON_NAME_WORDS: Final[frozenset[str]] = frozenset({
    "ach", "atm", "balance", "bank", "cash", "check", "credit", "debit", "deposit",
    "dividend", "fee", "interest", "online", "payment", "payroll", "refund",
    "reversal", "transfer", "wire", "wise", "zelle",
})

PAYER_NAME_MAX_LENGTH: Final = 255
