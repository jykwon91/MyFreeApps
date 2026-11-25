import uuid

from pydantic import BaseModel

from app.schemas.transactions.transaction import TransactionStatus


class PersonalTransferUnmarkResult(BaseModel):
    transaction_id: uuid.UUID
    # The status the transaction had before it was marked.
    status: TransactionStatus
    # Its Payment Review card was reopened.
    back_in_review: bool
    # Remembered senders forgotten along with it.
    forgotten_senders: int
