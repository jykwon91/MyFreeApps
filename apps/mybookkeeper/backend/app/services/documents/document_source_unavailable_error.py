class DocumentSourceUnavailableError(Exception):
    """The document's file can't be fetched: no stored file, no Gmail link, or the email is gone.

    Carries one of the fixed details in ``document_constants``. Not a
    ValueError, so a decoding error from a Gmail attachment or an ``.eml``
    can't pass for one of these and reach the reply.
    """
