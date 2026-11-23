from app.models.integrations.gmail_connection_snapshot import GmailConnectionSnapshot
from app.services.email.constants import GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR


class GmailDiscoveryAuthRejectedError(Exception):
    """Google rejected the token partway through discovery.

    Raised inside discovery's transaction so it rolls back, then caught outside
    it, where the reauth flag and the failed sync log are saved on their own.
    Carries a snapshot of the connection, since the rollback expires the row.
    ``sync_log_error`` is what the failed sync log and the connection's
    ``last_reauth_error`` tell the user; Google's own text is logged instead.
    """

    def __init__(
        self,
        connection: GmailConnectionSnapshot,
        message: str,
        sync_log_error: str = GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR,
    ) -> None:
        super().__init__(message)
        self.connection = connection
        self.sync_log_error = sync_log_error
