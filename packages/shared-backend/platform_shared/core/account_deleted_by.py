"""Who deleted an account, as the ``ACCOUNT_DELETED`` auth event's ``by`` records it."""


class AccountDeletedBy:
    SELF = "self"
    ADMIN = "admin"
