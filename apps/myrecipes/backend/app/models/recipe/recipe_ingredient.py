"""Recipe ingredient -- one line item belonging to a single version snapshot.

``lineage_key`` is stable across versions: when a tweak copies a parent version
forward, each carried-over ingredient keeps its lineage_key while genuinely new
ingredients get a fresh one. This lets the diff engine report
"salt 1 tsp -> 2 tsp" as a *change* rather than a remove + add.

``quantity`` is the numeric amount (e.g. 0.5 for half a cup); freeform amounts
like "to taste" live in ``note`` with ``quantity`` null.
"""
import uuid

from sqlalchemy import ForeignKey, Index, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredient"
    __table_args__ = (Index("ix_recipe_ingredient_version_id", "version_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("recipe_version.id", ondelete="CASCADE"),
        nullable=False,
    )
    lineage_key: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, default=uuid.uuid4,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[float | None] = mapped_column(Numeric(10, 3), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
