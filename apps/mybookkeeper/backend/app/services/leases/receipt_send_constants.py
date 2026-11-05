import datetime as _dt

# How long a ``sending`` claim is left alone before a new attempt checks Gmail
# for the email and settles the row. Far longer than any single Gmail request
# can take (``GMAIL_HTTP_TIMEOUT_SECONDS``), so the attempt that took the claim
# is finished before anyone looks.
RECEIPT_SEND_CLAIM_STALE_AFTER = _dt.timedelta(minutes=15)
