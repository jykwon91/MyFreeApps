class GmailAccountUnknownError(Exception):
    """Gmail couldn't say which account a connection is (getProfile failed).

    Raised before a send is claimed, so nothing was emailed: a send can't go
    out until its claim can record the address it goes through.
    """
