from app.schemas.transactions.bulk_transaction_ids_request import BulkTransactionIdsRequest


class BulkCapitalImprovementRequest(BulkTransactionIdsRequest):
    is_capital_improvement: bool
