"""Limits on the public inquiry form. The web form mirrors the move-in window."""

# Past this, the inquiry is almost certainly nonsense (or someone testing the
# form) and we reject it before Claude ever sees it.
MAX_MOVE_IN_DAYS_AHEAD = 365
# Operators sometimes get inquiries from people who already moved (referrals,
# last-minute situations), so a move-in date a little in the past is allowed.
PAST_MOVE_IN_GRACE_DAYS = 30
