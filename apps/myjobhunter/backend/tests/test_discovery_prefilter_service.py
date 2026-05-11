"""Tests for discovery_prefilter_service.rank_unscored_for_user (PR 4b).

Covers:

- Happy path (embedding branch): profile has an embedding, prefilter
  returns rows from the cosine-similarity ranked query.
- FIFO fallback: profile has no embedding, prefilter returns rows from
  the FIFO query.
- Zero eligible postings: prefilter returns an empty list (no error).
- Sentry breadcrumb emitted with the correct branch + counts.
- top_n is forwarded to both repository functions verbatim.
- Embedding branch reports eligible_count from the dedicated COUNT(*)
  query (not just len(rows)), so the operator can see embed-vs-fetch
  lag in Sentry.

The repository layer is mocked at the
``discovery_prefilter_repository`` import inside the service module —
no real DB. The Sentry SDK is also mocked so the test doesn't depend
on the SDK being initialized.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.discovery.discovered_job import DiscoveredJob
from app.services.discovery import discovery_prefilter_service


_PROFILE_EMB_PATH = (
    "app.services.discovery.discovery_prefilter_service."
    "discovery_prefilter_repository.get_profile_embedding"
)
_RANKED_PATH = (
    "app.services.discovery.discovery_prefilter_service."
    "discovery_prefilter_repository.list_unscored_with_embedding_ranked"
)
_FIFO_PATH = (
    "app.services.discovery.discovery_prefilter_service."
    "discovery_prefilter_repository.list_unscored_fifo_fallback"
)
_COUNT_PATH = (
    "app.services.discovery.discovery_prefilter_service."
    "discovery_prefilter_repository.count_unscored_with_embedding"
)
_BREADCRUMB_PATH = (
    "app.services.discovery.discovery_prefilter_service.sentry_sdk.add_breadcrumb"
)


def _make_job(user_id: uuid.UUID) -> DiscoveredJob:
    return DiscoveredJob(
        user_id=user_id,
        source="jsearch",
        source_external_id=str(uuid.uuid4()),
        title="Senior Engineer",
        company_name="Acme",
        remote_type="remote",
    )


def _profile_embedding() -> list[float]:
    """Stand-in 384-dim profile vector — actual values irrelevant to tests."""
    return [0.1] * 384


# ---------------------------------------------------------------------------
# Embedding branch
# ---------------------------------------------------------------------------


class TestEmbeddingBranch:
    @pytest.mark.asyncio
    async def test_returns_ranked_rows_when_profile_has_embedding(self) -> None:
        """Happy path: profile has an embedding → embedding branch is taken."""
        user_id = uuid.uuid4()
        jobs = [_make_job(user_id) for _ in range(5)]
        mock_db = AsyncMock()

        with (
            patch(_PROFILE_EMB_PATH, new=AsyncMock(return_value=_profile_embedding())),
            patch(_COUNT_PATH, new=AsyncMock(return_value=12)),
            patch(_RANKED_PATH, new=AsyncMock(return_value=jobs)) as mock_ranked,
            patch(_FIFO_PATH, new=AsyncMock()) as mock_fifo,
            patch(_BREADCRUMB_PATH),
        ):
            result = await discovery_prefilter_service.rank_unscored_for_user(
                mock_db, user_id, top_n=5,
            )

        assert result.branch == "embedding"
        assert result.rows == jobs
        assert result.eligible_count == 12
        mock_ranked.assert_awaited_once()
        mock_fifo.assert_not_called()

    @pytest.mark.asyncio
    async def test_top_n_forwarded_to_ranked_query(self) -> None:
        """top_n is passed to the ranked repository function verbatim."""
        user_id = uuid.uuid4()
        mock_db = AsyncMock()

        with (
            patch(_PROFILE_EMB_PATH, new=AsyncMock(return_value=_profile_embedding())),
            patch(_COUNT_PATH, new=AsyncMock(return_value=0)),
            patch(_RANKED_PATH, new=AsyncMock(return_value=[])) as mock_ranked,
            patch(_BREADCRUMB_PATH),
        ):
            await discovery_prefilter_service.rank_unscored_for_user(
                mock_db, user_id, top_n=42,
            )

        call_kwargs = mock_ranked.await_args.kwargs
        assert call_kwargs["top_n"] == 42
        assert call_kwargs["profile_embedding"] == _profile_embedding()

    @pytest.mark.asyncio
    async def test_eligible_count_reflects_count_query_not_rows_len(self) -> None:
        """eligible_count reports the distinct COUNT(*), not just len(rows).

        This lets the operator see embed/fetch lag in Sentry: if
        eligible=200 but returned=20, the prefilter is doing its job.
        If eligible=2 and returned=2 over many passes, fetches are
        thin / embeddings are stuck.
        """
        user_id = uuid.uuid4()
        jobs = [_make_job(user_id) for _ in range(20)]  # capped at top_n
        mock_db = AsyncMock()

        with (
            patch(_PROFILE_EMB_PATH, new=AsyncMock(return_value=_profile_embedding())),
            patch(_COUNT_PATH, new=AsyncMock(return_value=500)),
            patch(_RANKED_PATH, new=AsyncMock(return_value=jobs)),
            patch(_BREADCRUMB_PATH),
        ):
            result = await discovery_prefilter_service.rank_unscored_for_user(
                mock_db, user_id, top_n=20,
            )

        assert result.eligible_count == 500
        assert len(result.rows) == 20

    @pytest.mark.asyncio
    async def test_zero_eligible_returns_empty_list(self) -> None:
        """No eligible rows → empty list, branch=embedding (profile had an embedding)."""
        user_id = uuid.uuid4()
        mock_db = AsyncMock()

        with (
            patch(_PROFILE_EMB_PATH, new=AsyncMock(return_value=_profile_embedding())),
            patch(_COUNT_PATH, new=AsyncMock(return_value=0)),
            patch(_RANKED_PATH, new=AsyncMock(return_value=[])),
            patch(_BREADCRUMB_PATH),
        ):
            result = await discovery_prefilter_service.rank_unscored_for_user(
                mock_db, user_id, top_n=20,
            )

        assert result.rows == []
        assert result.branch == "embedding"
        assert result.eligible_count == 0


# ---------------------------------------------------------------------------
# FIFO fallback branch
# ---------------------------------------------------------------------------


class TestFifoFallbackBranch:
    @pytest.mark.asyncio
    async def test_no_profile_embedding_falls_back_to_fifo(self) -> None:
        """When profile embedding is None, FIFO query is used."""
        user_id = uuid.uuid4()
        jobs = [_make_job(user_id) for _ in range(3)]
        mock_db = AsyncMock()

        with (
            patch(_PROFILE_EMB_PATH, new=AsyncMock(return_value=None)),
            patch(_RANKED_PATH, new=AsyncMock()) as mock_ranked,
            patch(_FIFO_PATH, new=AsyncMock(return_value=jobs)) as mock_fifo,
            patch(_COUNT_PATH, new=AsyncMock()) as mock_count,
            patch(_BREADCRUMB_PATH),
        ):
            result = await discovery_prefilter_service.rank_unscored_for_user(
                mock_db, user_id, top_n=20,
            )

        assert result.branch == "fifo_fallback"
        assert result.rows == jobs
        # The eligible_count COUNT(*) query is NOT run on the FIFO path —
        # it would return rows with NULL embeddings too and would mislead
        # the operator. eligible_count mirrors len(rows) for FIFO.
        assert result.eligible_count == len(jobs)
        mock_fifo.assert_awaited_once()
        mock_ranked.assert_not_called()
        mock_count.assert_not_called()

    @pytest.mark.asyncio
    async def test_fifo_top_n_forwarded(self) -> None:
        """top_n is passed to the FIFO repository function verbatim."""
        user_id = uuid.uuid4()
        mock_db = AsyncMock()

        with (
            patch(_PROFILE_EMB_PATH, new=AsyncMock(return_value=None)),
            patch(_FIFO_PATH, new=AsyncMock(return_value=[])) as mock_fifo,
            patch(_BREADCRUMB_PATH),
        ):
            await discovery_prefilter_service.rank_unscored_for_user(
                mock_db, user_id, top_n=7,
            )

        assert mock_fifo.await_args.kwargs["top_n"] == 7

    @pytest.mark.asyncio
    async def test_fifo_zero_eligible_returns_empty_list(self) -> None:
        """FIFO branch with zero eligible rows returns an empty list."""
        user_id = uuid.uuid4()
        mock_db = AsyncMock()

        with (
            patch(_PROFILE_EMB_PATH, new=AsyncMock(return_value=None)),
            patch(_FIFO_PATH, new=AsyncMock(return_value=[])),
            patch(_BREADCRUMB_PATH),
        ):
            result = await discovery_prefilter_service.rank_unscored_for_user(
                mock_db, user_id, top_n=20,
            )

        assert result.rows == []
        assert result.branch == "fifo_fallback"
        assert result.eligible_count == 0


# ---------------------------------------------------------------------------
# Sentry breadcrumb
# ---------------------------------------------------------------------------


class TestSentryBreadcrumb:
    @pytest.mark.asyncio
    async def test_embedding_branch_emits_breadcrumb(self) -> None:
        """Embedding branch emits a breadcrumb with branch=embedding."""
        user_id = uuid.uuid4()
        jobs = [_make_job(user_id) for _ in range(5)]
        mock_db = AsyncMock()

        with (
            patch(_PROFILE_EMB_PATH, new=AsyncMock(return_value=_profile_embedding())),
            patch(_COUNT_PATH, new=AsyncMock(return_value=42)),
            patch(_RANKED_PATH, new=AsyncMock(return_value=jobs)),
            patch(_BREADCRUMB_PATH) as mock_breadcrumb,
        ):
            await discovery_prefilter_service.rank_unscored_for_user(
                mock_db, user_id, top_n=5,
            )

        mock_breadcrumb.assert_called_once()
        kwargs = mock_breadcrumb.call_args.kwargs
        assert kwargs["category"] == "discovery.prefilter"
        assert kwargs["data"]["prefilter_branch"] == "embedding"
        assert kwargs["data"]["prefilter_eligible_count"] == 42
        assert kwargs["data"]["prefilter_returned_count"] == 5
        assert kwargs["data"]["prefilter_top_n"] == 5
        assert kwargs["data"]["user_id"] == str(user_id)

    @pytest.mark.asyncio
    async def test_fifo_branch_emits_breadcrumb(self) -> None:
        """FIFO branch emits a breadcrumb with branch=fifo_fallback."""
        user_id = uuid.uuid4()
        jobs = [_make_job(user_id) for _ in range(3)]
        mock_db = AsyncMock()

        with (
            patch(_PROFILE_EMB_PATH, new=AsyncMock(return_value=None)),
            patch(_FIFO_PATH, new=AsyncMock(return_value=jobs)),
            patch(_BREADCRUMB_PATH) as mock_breadcrumb,
        ):
            await discovery_prefilter_service.rank_unscored_for_user(
                mock_db, user_id, top_n=20,
            )

        mock_breadcrumb.assert_called_once()
        kwargs = mock_breadcrumb.call_args.kwargs
        assert kwargs["data"]["prefilter_branch"] == "fifo_fallback"
        assert kwargs["data"]["prefilter_returned_count"] == 3


# ---------------------------------------------------------------------------
# Error propagation — no silent bandaid
# ---------------------------------------------------------------------------


class TestErrorPropagation:
    @pytest.mark.asyncio
    async def test_db_error_propagates_not_swallowed(self) -> None:
        """A DB-level exception (e.g. pgvector unloaded) propagates.

        Per ``rules/no-bandaid-solutions.md``: the prefilter does NOT
        catch and degrade to FIFO when the ranked query raises. A
        failing cosine query is an infrastructure bug worth surfacing
        — the PR 4a boot guard should have caught it earlier.
        """
        user_id = uuid.uuid4()
        mock_db = AsyncMock()

        class _PgvectorMissing(RuntimeError):
            pass

        with (
            patch(_PROFILE_EMB_PATH, new=AsyncMock(return_value=_profile_embedding())),
            patch(_COUNT_PATH, new=AsyncMock(return_value=10)),
            patch(
                _RANKED_PATH,
                new=AsyncMock(side_effect=_PgvectorMissing("operator <=> not found")),
            ),
            patch(_BREADCRUMB_PATH),
        ):
            with pytest.raises(_PgvectorMissing):
                await discovery_prefilter_service.rank_unscored_for_user(
                    mock_db, user_id, top_n=20,
                )
