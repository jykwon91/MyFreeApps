"""One kind of WoW image the icon service serves (icons, satellite views)."""
from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class AssetKind:
    # Must fullmatch the requested file name; one group = the numeric id,
    # normalised into the key (no leading zeros).
    file_name: re.Pattern[str]
    download: Callable[[str], bytes]
