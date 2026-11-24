"""A user row whose unique email a failed flush can repeat."""

from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from tests.probe_base import ProbeBase


class ProbeUser(ProbeBase):
    __tablename__ = "probe_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True)
