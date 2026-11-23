"""What happened to one text a tenant sent to the reminder number.

- ``forwarded``    queued to email to the landlord whose reminder it answers
- ``unmatched``    no recent reminder text went to that number
- ``ambiguous``    two landlords texted the number too close together to tell
- ``unreachable``  the matching landlord or tenant is no longer there to email
- ``over_limit``   that number already had its share of forwards this hour
- ``not_for_us``   not a phone text to our sending number
"""
from __future__ import annotations

from typing import Literal

ReplyOutcome = Literal[
    "forwarded", "unmatched", "ambiguous", "unreachable", "over_limit", "not_for_us",
]
