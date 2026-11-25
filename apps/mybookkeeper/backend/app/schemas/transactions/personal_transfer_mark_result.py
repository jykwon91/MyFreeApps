import uuid

from pydantic import BaseModel

from app.schemas.transactions.personal_transfer_sender_read import PersonalTransferSenderRead


class PersonalTransferMarkResult(BaseModel):
    transaction_id: uuid.UUID
    # Who will be skipped from now on; None when the payment named no sender.
    remembered_sender: PersonalTransferSenderRead | None
    # Other open Payment Review cards from the same sender, marked as well.
    also_cleared: int
