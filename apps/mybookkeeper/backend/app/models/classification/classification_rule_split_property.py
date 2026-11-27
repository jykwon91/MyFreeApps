import uuid

from sqlalchemy import ForeignKey, Index, SmallInteger, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ClassificationRuleSplitProperty(Base):
    """One of the properties a payee rule splits each matching payment evenly across.

    A rule with two or more of these has no ``property_id`` of its own. Scoped to
    an organization through its rule. Deleting a property drops it from the
    rule (CASCADE): the rule then splits across the properties that are left,
    or files to the one that is left.
    """

    __tablename__ = "classification_rule_split_properties"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("classification_rules.id", ondelete="CASCADE"), nullable=False,
    )
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False,
    )
    # The order the person picked them in; an even split's odd cents go to the first.
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    __table_args__ = (
        UniqueConstraint("rule_id", "property_id", name="uq_rule_split_property"),
        Index("ix_rule_split_property", "property_id"),
    )

    rule = relationship("ClassificationRule", back_populates="split_properties")
