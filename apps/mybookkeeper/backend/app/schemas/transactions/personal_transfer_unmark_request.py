from pydantic import BaseModel


class PersonalTransferUnmarkRequest(BaseModel):
    # Also stop treating this sender's future payments as personal transfers.
    forget_sender: bool = False
