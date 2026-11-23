"""Raised when the admin read-only query tool refuses a query or can't read its result."""


class DbAdminQueryError(Exception):
    """Carries one of the fixed replies in ``db_admin_query_messages``; its text is safe to show."""
