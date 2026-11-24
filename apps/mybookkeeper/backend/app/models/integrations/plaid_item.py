"""One Plaid connection: a person's login at one bank.

Scoped to the user as well as the organization, like ``financial_accounts``:
the bank login is a person's, and the accounts it feeds are theirs.

The access token is a long-lived credential to the person's bank data. It is
stored encrypted with the OAuth-token key family (``app.core.security``), the
same as Gmail's tokens on ``integrations``: ``access_token`` is a hybrid
property that encrypts on write and decrypts on read, and only the
ciphertext (``access_token_encrypted``) reaches the database. The column name
is in ``MBK_SENSITIVE_FIELDS`` so the audit log masks it. Never log it.

Disconnecting deletes the row (after Plaid's ``/item/remove``); the accounts
and transactions it brought in stay, unlinked (``financial_accounts.plaid_item_id``
is SET NULL).
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column

from app.core.plaid_constants import (
    PLAID_ERROR_CODE_MAX_LENGTH,
    PLAID_ERROR_TYPE_MAX_LENGTH,
    PLAID_ID_MAX_LENGTH,
    PLAID_INSTITUTION_ID_MAX_LENGTH,
)
from app.core.financial_account_enums import INSTITUTION_MAX_LENGTH
from app.core.plaid_item_enums import (
    PLAID_INVESTMENTS_STATUSES_SQL,
    PLAID_ITEM_STATUS_ACTIVE,
    PLAID_ITEM_STATUS_MAX_LENGTH,
    PLAID_ITEM_STATUSES_SQL,
)
from app.core.security import decrypt_token, encrypt_token
from app.db.base import Base


class PlaidItem(Base):
    __tablename__ = "plaid_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # Plaid's id for the item. Globally unique at Plaid; webhooks name it.
    plaid_item_id: Mapped[str] = mapped_column(String(PLAID_ID_MAX_LENGTH), nullable=False)
    institution_id: Mapped[str | None] = mapped_column(
        String(PLAID_INSTITUTION_ID_MAX_LENGTH), nullable=True,
    )
    institution_name: Mapped[str | None] = mapped_column(
        String(INSTITUTION_MAX_LENGTH), nullable=True,
    )

    access_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    key_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default="1",
    )

    # Where /transactions/sync left off. NULL until the first sync completes,
    # which asks Plaid for the whole history.
    transactions_cursor: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(PLAID_ITEM_STATUS_MAX_LENGTH),
        nullable=False,
        default=PLAID_ITEM_STATUS_ACTIVE,
        server_default=PLAID_ITEM_STATUS_ACTIVE,
    )
    # The last error Plaid reported for this item; cleared by the next
    # successful sync. Kept so the reason is visible without the logs.
    error_type: Mapped[str | None] = mapped_column(
        String(PLAID_ERROR_TYPE_MAX_LENGTH), nullable=True,
    )
    error_code: Mapped[str | None] = mapped_column(
        String(PLAID_ERROR_CODE_MAX_LENGTH), nullable=True,
    )

    last_synced_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # Investment holdings, kept apart from the transactions status above so a
    # bank that won't give holdings never marks the connection broken. NULL
    # until the sync first asks (``plaid_item_enums``). The code is Plaid's
    # last refusal for holdings, cleared when holdings next arrive.
    investments_status: Mapped[str | None] = mapped_column(
        String(PLAID_ITEM_STATUS_MAX_LENGTH), nullable=True,
    )
    investments_error_code: Mapped[str | None] = mapped_column(
        String(PLAID_ERROR_CODE_MAX_LENGTH), nullable=True,
    )
    holdings_synced_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        onupdate=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            f"status IN {PLAID_ITEM_STATUSES_SQL}", name="chk_plaid_item_status",
        ),
        CheckConstraint(
            f"investments_status IS NULL OR investments_status IN {PLAID_INVESTMENTS_STATUSES_SQL}",
            name="chk_plaid_item_investments_status",
        ),
        Index("uq_plaid_items_plaid_item_id", "plaid_item_id", unique=True),
        # The Accounts page lists one person's connections.
        Index("ix_plaid_items_org_user", "organization_id", "user_id"),
    )

    @hybrid_property
    def access_token(self) -> str:
        return decrypt_token(self.access_token_encrypted)

    @access_token.setter  # type: ignore[no-redef]
    def access_token(self, value: str) -> None:
        self.access_token_encrypted = encrypt_token(value)
