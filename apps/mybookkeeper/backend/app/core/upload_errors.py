"""Map upload rejections onto HTTP status codes.

``document_upload_service.accept_upload`` signals every rejection as a bare
``ValueError``, so the wording is what separates a file that is too large from
one the daily limit refused. Shared by every route that accepts a file upload so
they all answer with the same code for the same rejection.
"""


def upload_error_status(message: str) -> int:
    """HTTP status for an ``accept_upload`` rejection message."""
    lowered = message.lower()
    if "limit" in lowered and "MB" in message:
        return 413
    if "daily upload limit" in lowered:
        return 429
    if "unsupported" in lowered:
        return 415
    return 422
