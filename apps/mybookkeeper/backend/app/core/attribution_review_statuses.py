"""How a Payment Review card (``rent_attribution_review_queue``) is resolved."""

REVIEW_PENDING = "pending"
REVIEW_CONFIRMED = "confirmed"
REVIEW_REJECTED = "rejected"
# The payment was marked a personal transfer: not rent from anyone.
REVIEW_PERSONAL = "personal"
# The payment's transaction was deleted, so there is nothing left to review.
REVIEW_DISMISSED = "dismissed"
