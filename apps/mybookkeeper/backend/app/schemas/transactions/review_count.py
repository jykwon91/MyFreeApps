from pydantic import BaseModel


class TransactionReviewCount(BaseModel):
    count: int
