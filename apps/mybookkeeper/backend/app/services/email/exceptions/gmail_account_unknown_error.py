class GmailAccountUnknownError(Exception):
    """Gmail couldn't say which account a connection is (getProfile failed).

    Raised before a send is claimed, so nothing was emailed: a send can't go
    out until its claim can record the address it goes through.

    The message is shown to the host as the reply's ``detail``: raise it only
    with fixed copy written for them, never with Google's or a library's text.
    """
