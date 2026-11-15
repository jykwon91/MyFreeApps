"""The transaction routes read their whole query string, list params repeated, alongside limit and offset.

FastAPI reads a query-parameter model's fields as separate params only when the model is the
route's sole query parameter, so these run the real routes with the service stubbed out.
"""
from collections.abc import Iterator
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import exports, transactions
from app.core.permissions import current_org_member
from app.schemas.transactions.transaction_filters import TransactionFilters
from app.schemas.transactions.transaction_list_page import TransactionListPage
from app.schemas.transactions.transaction_sort_key import TransactionSortKey

_EMPTY_PAGE = TransactionListPage(items=[], total=0, has_more=False)


@pytest.fixture
def client() -> Iterator[TestClient]:
    app = FastAPI()
    app.include_router(transactions.router)
    app.include_router(exports.router)
    app.dependency_overrides[current_org_member] = lambda: None
    yield TestClient(app)


def _filters(service: AsyncMock) -> TransactionFilters:
    return service.await_args.args[1]


class TestListRoutes:
    def test_the_page_reads_repeated_filters_the_sort_and_the_page(self, client: TestClient) -> None:
        with patch.object(transactions.transaction_service, "list_transaction_page", AsyncMock(return_value=_EMPTY_PAGE)) as service:
            response = client.get(
                "/transactions/page",
                params={"statuses": ["approved", "pending"], "sort": ["property_id:asc", "amount:desc"], "limit": 25, "offset": 50},
            )

        assert response.status_code == 200, response.text
        filters = _filters(service)
        assert filters.statuses == ["approved", "pending"]
        assert filters.sort_keys() == [TransactionSortKey("property_id", "asc"), TransactionSortKey("amount", "desc")]
        assert service.await_args.kwargs == {"limit": 25, "offset": 50}
        assert "limit" not in filters.filter_args()

    def test_the_list_reads_repeated_filters_and_its_batch(self, client: TestClient) -> None:
        with patch.object(transactions.transaction_service, "list_transactions", AsyncMock(return_value=[])) as service:
            response = client.get(
                "/transactions",
                params={"categories": ["utilities", "maintenance"], "sort_by": "amount", "sort_dir": "asc", "limit": 7, "offset": 3},
            )

        assert response.status_code == 200, response.text
        assert _filters(service).categories == ["utilities", "maintenance"]
        assert _filters(service).sort_keys() == [TransactionSortKey("amount", "asc")]
        assert service.await_args.kwargs == {"limit": 7, "offset": 3}

    @pytest.mark.parametrize(
        ("path", "params"),
        [
            ("/transactions/page", {"limit": 0}),
            ("/transactions/page", {"offset": -1}),
            ("/transactions/page", {"sort": "description:asc"}),
            ("/transactions", {"limit": 6000}),
            ("/transactions/selection", {"sort": ["amount:asc", "amount:desc"]}),
            ("/exports/transactions/csv", {"sort": "amount:sideways"}),
        ],
    )
    def test_refuses_out_of_range_paging_and_bad_sorts(self, client: TestClient, path: str, params: dict[str, object]) -> None:
        assert client.get(path, params=params).status_code == 422

    def test_the_export_reads_the_multi_column_sort(self, client: TestClient) -> None:
        with patch.object(exports.export_service, "export_transactions_csv", AsyncMock(return_value=b"")) as service, \
                patch.object(exports, "_check_export_rate_limit"):
            response = client.get("/exports/transactions/csv", params={"sort": ["vendor:asc", "amount:desc"]})

        assert response.status_code == 200, response.text
        assert _filters(service).sort_keys() == [TransactionSortKey("vendor", "asc"), TransactionSortKey("amount", "desc")]
