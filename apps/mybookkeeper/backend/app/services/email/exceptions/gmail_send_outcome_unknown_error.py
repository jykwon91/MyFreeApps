from app.services.email.exceptions.gmail_send_error import GmailSendError


class GmailSendOutcomeUnknownError(GmailSendError):
    """Gmail may or may not have sent the message.

    Raised for 5xx responses, timeouts, dropped connections, and a success
    response with no message id — cases where the request may have reached
    Gmail and been delivered. A caller that must never send twice treats this
    as "possibly sent" and confirms against the mailbox before retrying.
    Callers that only need "did it fail" can keep catching ``GmailSendError``.
    """
