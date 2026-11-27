import uuid

from pydantic import BaseModel, model_validator

from app.core.property_split_constants import SPLIT_REQUEST_ONE_FORM
from app.schemas.transactions.transaction_property_share import TransactionPropertyShare


class TransactionPropertySplitRequest(BaseModel):
    """Split a transaction across properties: name each share, or name the properties to split it evenly across.

    ``even_across`` divides to the cent with the odd cents going to the first
    properties listed. Either way the shares replace any split already there.
    """

    shares: list[TransactionPropertyShare] | None = None
    even_across: list[uuid.UUID] | None = None

    @model_validator(mode="after")
    def _exactly_one_form(self) -> "TransactionPropertySplitRequest":
        if (self.shares is None) == (self.even_across is None):
            raise ValueError(SPLIT_REQUEST_ONE_FORM)
        return self
