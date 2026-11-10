"""Raised when one extraction can outlast the upload processor's heartbeat budget."""


class UploadHeartbeatTooShortError(RuntimeError):
    """The healthcheck would report a healthy upload worker as dead mid-extraction."""
