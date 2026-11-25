# The statuses a person still has to look at. Approving moves a row out of this
# set, and only approved rows count towards totals.
REVIEWABLE_STATUSES = ("pending", "needs_review", "unverified")

COUNTED_STATUS = "approved"

# A copy folded into another row by a duplicate merge: soft-deleted, recoverable.
DUPLICATE_STATUS = "duplicate"
