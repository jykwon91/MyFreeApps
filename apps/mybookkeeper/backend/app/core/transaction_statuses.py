# The statuses a person still has to look at. Approving moves a row out of this
# set, and only approved rows count towards totals.
REVIEWABLE_STATUSES = ("pending", "needs_review", "unverified")

COUNTED_STATUS = "approved"

# A copy folded into another row by a duplicate merge: soft-deleted, recoverable.
DUPLICATE_STATUS = "duplicate"

# Money between the person and a friend or relative (a Zelle from a sibling,
# paying a friend back). Kept on file, but it is neither income nor spending, so
# it never counts towards a total. The status it had before is kept beside it
# (``status_before_personal_transfer``) so un-marking restores it exactly.
PERSONAL_TRANSFER_STATUS = "personal_transfer"

# The statuses a row can be marked a personal transfer from, and so the ones
# un-marking can restore.
PERSONAL_TRANSFER_PRIOR_STATUSES = (*REVIEWABLE_STATUSES, COUNTED_STATUS)

# Rows that are money nobody earned or spent, for the queries that count
# reviewable rows as well as approved ones (the rent ledger, monthly expenses).
NOT_MONEY_STATUSES = (DUPLICATE_STATUS, PERSONAL_TRANSFER_STATUS)

TRANSACTION_STATUSES = (*PERSONAL_TRANSFER_PRIOR_STATUSES, DUPLICATE_STATUS, PERSONAL_TRANSFER_STATUS)
