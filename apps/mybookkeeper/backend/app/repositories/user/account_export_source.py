"""Where the account data export reads one table from."""
from dataclasses import dataclass

from app.core.account_export_scope import AccountExportScope
from app.db.base import Base
from app.models.organization.organization_member import OrgRole


@dataclass(frozen=True)
class AccountExportSource:
    """One exported table and how its rows are selected.

    ``parent`` and ``parent_fk`` are set only for ``AccountExportScope.CHILD``:
    a row is exported when ``parent_fk`` points at an exported ``parent`` row.

    ``read_roles`` mirrors the role check on the table's read endpoint in the
    app: when set, the table is exported only to members holding one of those
    roles. ``None`` means every member of the workspace can read it.
    """

    model: type[Base]
    scope: AccountExportScope
    parent: type[Base] | None = None
    parent_fk: str | None = None
    read_roles: frozenset[OrgRole] | None = None

    def __post_init__(self) -> None:
        is_child = self.scope is AccountExportScope.CHILD
        if is_child != (self.parent is not None and self.parent_fk is not None):
            raise ValueError(
                f"{self.model.__tablename__}: parent and parent_fk are required for, "
                "and only for, the CHILD scope",
            )

    def is_readable_by(self, org_role: OrgRole) -> bool:
        return self.read_roles is None or org_role in self.read_roles
