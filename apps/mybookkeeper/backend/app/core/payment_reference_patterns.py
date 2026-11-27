"""What a payment reference looks like in a bank descriptor, so a payee key can leave it out.

Each pattern is tried on one lower-cased, whitespace-split token. The first word of a
descriptor is never a reference ("7-eleven", "24 hour fitness", "1-800-flowers.com").
"""
from __future__ import annotations

import re
from typing import Final

# A reference number: four or more digits once separators are dropped ("29520127614", "11/26", "0412").
LONG_NUMBER: Final = re.compile(r"[\d\-/.:]*\d[\d\-/.:]*")
LONG_NUMBER_MIN_DIGITS: Final = 4

# A store number: "#6512", "#33155", "f1234", "t-1234".
STORE_NUMBER: Final = re.compile(r"#\S*\d\S*|[a-z]{1,2}-?\d{3,}")

# A confirmation id: letters and digits mixed, eight or more long ("jpm99cjlb7cn").
CONFIRMATION_ID: Final = re.compile(r"(?=(?:[a-z]*\d){2})(?=(?:\d*[a-z]){2})[a-z\d]{8,}")

# "ref#123", "conf:9", "id:4411": a label stuck to its value.
LABELLED_REFERENCE: Final = re.compile(r"(?:ref|conf|confirmation|trace|trn|txn|id)[#:.]\S*")

# Words that introduce a reference when the next word carries a digit: "conf 99812", "trace 4471".
REFERENCE_LABELS: Final[frozenset[str]] = frozenset({"ref", "conf", "confirmation", "trace", "trn", "txn"})

# Chase and other ACH descriptors: "ppd id: 9123456789", "web id: ...".
ACH_ENTRY_CODES: Final[frozenset[str]] = frozenset({"ppd", "ccd", "web", "tel", "ctx", "arc", "boc"})
ACH_ID_WORD: Final = "id"

# "amzn mktp us*2k3ab1c": a reference after a "*" inside a word.
STAR_REFERENCE: Final = re.compile(r"\*\S*\d")

# Trailing punctuation left once a reference is cut off ("silvia -", "wal-mart #").
TRAILING_PUNCTUATION: Final = " -*#:,./"
