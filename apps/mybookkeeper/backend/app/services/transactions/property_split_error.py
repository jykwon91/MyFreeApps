"""A property split that can't be saved: the message says why, in the person's words.

A ``ValueError`` so the transaction routes answer 422 with the message.
"""


class PropertySplitError(ValueError):
    pass
