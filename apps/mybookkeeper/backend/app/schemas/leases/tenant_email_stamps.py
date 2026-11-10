"""A tenant email's start: the time it stamped, and what that replaced.

A send that never went out puts the replaced values back, but only where the
stamp is still ``stamped_at``; a later email's stamp is left alone.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class TenantEmailStamps:
    stamped_at: _dt.datetime
    lease_emailed_at: _dt.datetime | None
    files_emailed_at: dict[uuid.UUID, _dt.datetime | None]
