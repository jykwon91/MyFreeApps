from app.models.integrations.gmail_connection_snapshot import GmailConnectionSnapshot


class GmailDiscoveryAuthRejectedError(Exception):
    """Google rejected the token partway through discovery.

    Raised inside discovery's transaction so it rolls back, then caught outside
    it, where the reauth flag and the failed sync log are saved on their own.
    Carries a snapshot of the connection, since the rollback expires the row.
    """

    def __init__(self, connection: GmailConnectionSnapshot, reason: str, message: str) -> None:
        super().__init__(message)
        self.connection = connection
        self.reason = reason
