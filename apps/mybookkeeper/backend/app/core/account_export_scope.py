"""How the account data export selects one table's rows."""
from enum import StrEnum


class AccountExportScope(StrEnum):
    """Which rows of a table belong in one user's export of one workspace.

    The export never reaches beyond what the user can read in the app: rows
    every member of the workspace can see are exported workspace-wide, rows the
    app shows only to the member who owns them are exported only when they are
    the requesting user's.
    """

    # The workspace row itself (``organizations.id`` is the request's workspace).
    WORKSPACE_ITSELF = "workspace_itself"
    # Every row of the request's workspace.
    WORKSPACE = "workspace"
    # The requesting user's own rows in the request's workspace.
    WORKSPACE_MEMBER = "workspace_member"
    # The requesting user's own rows; the table has no workspace column.
    USER = "user"
    # Rows whose parent row (by foreign key) is itself exported.
    CHILD = "child"
