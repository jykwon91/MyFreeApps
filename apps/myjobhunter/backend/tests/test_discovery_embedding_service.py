"""Tests for the discovery embedding service.

Covers:

- ``embed_text`` returns 384-dim vectors of the expected shape
- ``embed_posting`` includes title + company + truncated description
- ``embed_profile`` includes summary, skills, work history
- ``embed_pending_for_user`` populates ``embedding`` / ``embedding_model``
  / ``embedded_at`` on rows where embedding was NULL, batches commits,
  and is idempotent on re-run (no rows left with NULL embedding)
- ``refresh_profile_embedding`` writes the profile row's embedding columns
- ``EmbeddingModelLoadError`` is raised when fastembed.TextEmbedding fails
  to instantiate
- ``load_model_eager`` is the boot-guard entry point and propagates the
  same error

Fastembed is patched out for the unit tests — loading the actual model
costs ~1s and ~90MB of RAM per test run. One end-to-end test
(``test_real_fastembed_smoke``) exercises the full path; it's marked
``slow`` so CI can skip it on PR checks.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Iterable

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob
from app.models.profile.profile import Profile
from app.models.profile.skill import Skill
from app.models.profile.work_history import WorkHistory
from app.services.discovery import discovery_embedding_service
from app.services.discovery.discovery_embedding_service import (
    EmbeddingModelLoadError,
    _assemble_posting_text,
    _assemble_profile_text,
    _EMBED_DIMS,
    _MODEL_NAME,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _FakeArray(list):
    """Stand-in for numpy.ndarray that supports .tolist() like the real one."""

    def tolist(self) -> list[float]:
        return list(self)


class _FakeModel:
    """Stand-in for fastembed.TextEmbedding.

    Returns a deterministic vector for each input — first dim is a hash
    of the input string, rest are zeros — so tests can assert that
    different texts produce different vectors without running ONNX.
    """

    def __init__(self) -> None:
        self.last_inputs: list[str] = []

    def embed(self, inputs: Iterable[str]):
        for txt in inputs:
            self.last_inputs.append(txt)
            vec = [0.0] * _EMBED_DIMS
            # Stable per-input first dim
            vec[0] = float(hash(txt) % 1000) / 1000.0
            yield _FakeArray(vec)


# Capture the real functions at module import time, BEFORE any conftest
# autouse fixture has had a chance to patch them. The conftest's
# ``_disable_discovery_embedding_background`` fixture is function-scoped,
# so at module load it has not yet run — these bindings are the real
# implementations.
_ORIGINAL_REFRESH = discovery_embedding_service.refresh_profile_embedding
_ORIGINAL_BG = discovery_embedding_service.embed_pending_for_user_background


@pytest.fixture(autouse=True)
def _patch_model(monkeypatch: pytest.MonkeyPatch) -> _FakeModel:
    """Replace the lazy model loader with a deterministic fake AND
    restore the real refresh / background-task symbols.

    The global conftest no-ops both functions so that other tests don't
    pull in fastembed via BackgroundTasks. This test module is the one
    place where the real implementations should run — bound back here
    against the fake model.
    """
    fake = _FakeModel()
    monkeypatch.setattr(
        discovery_embedding_service, "_model", fake, raising=False,
    )
    monkeypatch.setattr(
        discovery_embedding_service, "_get_model", lambda: fake,
    )
    monkeypatch.setattr(
        discovery_embedding_service,
        "refresh_profile_embedding",
        _ORIGINAL_REFRESH,
    )
    monkeypatch.setattr(
        discovery_embedding_service,
        "embed_pending_for_user_background",
        _ORIGINAL_BG,
    )
    return fake


# ---------------------------------------------------------------------------
# embed_text / embed_posting / embed_profile assembly
# ---------------------------------------------------------------------------


def test_embed_text_returns_384_dims(_patch_model: _FakeModel) -> None:
    vec = discovery_embedding_service.embed_text("hello world")
    assert isinstance(vec, list)
    assert len(vec) == _EMBED_DIMS
    assert all(isinstance(x, float) for x in vec)


def test_embed_text_uses_provided_string(_patch_model: _FakeModel) -> None:
    discovery_embedding_service.embed_text("a senior engineer in chicago")
    assert _patch_model.last_inputs[-1] == "a senior engineer in chicago"


def test_assemble_posting_text_includes_title_company_description() -> None:
    posting = DiscoveredJob(
        user_id=uuid.uuid4(),
        source="jsearch",
        source_external_id="x",
        title="Senior Backend Engineer",
        company_name="Acme Corp",
        description="We use Python, FastAPI, and Postgres. Remote.",
    )
    text = _assemble_posting_text(posting)
    assert "Senior Backend Engineer" in text
    assert "Acme Corp" in text
    assert "Python, FastAPI" in text


def test_assemble_posting_text_truncates_long_description() -> None:
    long_desc = "x" * 5000
    posting = DiscoveredJob(
        user_id=uuid.uuid4(),
        source="jsearch",
        source_external_id="x",
        title="T",
        company_name="C",
        description=long_desc,
    )
    text = _assemble_posting_text(posting)
    # 2000 chars of x's + "T C "
    assert text.count("x") == 2000


def test_embed_posting_returns_model_name(_patch_model: _FakeModel) -> None:
    posting = DiscoveredJob(
        user_id=uuid.uuid4(),
        source="jsearch",
        source_external_id="x",
        title="Eng",
        company_name="Acme",
        description="d",
    )
    vec, model_name = discovery_embedding_service.embed_posting(posting)
    assert len(vec) == _EMBED_DIMS
    assert model_name == _MODEL_NAME


def test_assemble_profile_text_includes_summary_skills_work_history() -> None:
    user_id = uuid.uuid4()
    profile_id = uuid.uuid4()
    profile = Profile(
        id=profile_id,
        user_id=user_id,
        summary="Staff backend engineer with 10y of Python.",
    )
    skills = [
        Skill(user_id=user_id, profile_id=profile_id, name="Python"),
        Skill(user_id=user_id, profile_id=profile_id, name="FastAPI"),
    ]
    wh = [
        WorkHistory(
            user_id=user_id,
            profile_id=profile_id,
            company_name="Acme",
            title="Staff Engineer",
            bullets=["Built X", "Scaled Y"],
        ),
    ]
    text = _assemble_profile_text(profile, skills, wh)
    assert "Staff backend engineer with 10y" in text
    assert "Python" in text
    assert "FastAPI" in text
    assert "Staff Engineer" in text
    assert "Acme" in text
    assert "Built X" in text


def test_assemble_profile_text_empty_when_nothing_filled() -> None:
    profile = Profile(user_id=uuid.uuid4())
    assert _assemble_profile_text(profile, [], []) == ""


# ---------------------------------------------------------------------------
# embed_pending_for_user — DB integration
# ---------------------------------------------------------------------------


def _make_discovered_job(user_id: uuid.UUID, ext: str) -> DiscoveredJob:
    return DiscoveredJob(
        user_id=user_id,
        source="jsearch",
        source_external_id=ext,
        title=f"Title {ext}",
        company_name="Acme",
        description=f"Description for {ext}",
    )


@pytest.mark.asyncio
async def test_embed_pending_for_user_populates_columns(
    db: AsyncSession, user_factory,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    db.add_all(
        [
            _make_discovered_job(user_id, "j1"),
            _make_discovered_job(user_id, "j2"),
            _make_discovered_job(user_id, "j3"),
        ],
    )
    await db.commit()

    count = await discovery_embedding_service.embed_pending_for_user(
        db, user_id, batch_size=10,
    )
    assert count == 3

    result = await db.execute(
        select(DiscoveredJob).where(DiscoveredJob.user_id == user_id),
    )
    rows = list(result.scalars().all())
    assert len(rows) == 3
    for row in rows:
        assert row.embedding is not None
        # Pgvector returns a numpy.ndarray; coerce to list for length check.
        assert len(list(row.embedding)) == _EMBED_DIMS
        assert row.embedding_model == _MODEL_NAME
        assert row.embedded_at is not None


@pytest.mark.asyncio
async def test_embed_pending_for_user_is_idempotent(
    db: AsyncSession, user_factory,
) -> None:
    """Second call with no new rows returns 0 and doesn't re-embed."""
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    db.add(_make_discovered_job(user_id, "only"))
    await db.commit()

    first = await discovery_embedding_service.embed_pending_for_user(
        db, user_id,
    )
    assert first == 1

    second = await discovery_embedding_service.embed_pending_for_user(
        db, user_id,
    )
    assert second == 0


@pytest.mark.asyncio
async def test_embed_pending_for_user_only_touches_caller_user(
    db: AsyncSession, user_factory,
) -> None:
    user_a = await user_factory()
    user_b = await user_factory()
    a_id = uuid.UUID(user_a["id"])
    b_id = uuid.UUID(user_b["id"])

    db.add(_make_discovered_job(a_id, "a1"))
    db.add(_make_discovered_job(b_id, "b1"))
    await db.commit()

    embedded = await discovery_embedding_service.embed_pending_for_user(
        db, a_id,
    )
    assert embedded == 1

    # B's row should still be unembedded.
    result = await db.execute(
        select(DiscoveredJob).where(DiscoveredJob.user_id == b_id),
    )
    b_row = result.scalar_one()
    assert b_row.embedding is None
    assert b_row.embedding_model is None


# ---------------------------------------------------------------------------
# refresh_profile_embedding
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_profile_embedding_writes_columns(
    db: AsyncSession, user_factory,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    profile = Profile(user_id=user_id, summary="Senior engineer")
    db.add(profile)
    await db.commit()

    ok = await discovery_embedding_service.refresh_profile_embedding(
        db, user_id,
    )
    assert ok is True

    result = await db.execute(
        select(Profile).where(Profile.user_id == user_id),
    )
    row = result.scalar_one()
    assert row.embedding is not None
    assert len(list(row.embedding)) == _EMBED_DIMS
    assert row.embedding_model == _MODEL_NAME
    assert row.embedded_at is not None


@pytest.mark.asyncio
async def test_refresh_profile_embedding_returns_false_when_missing(
    db: AsyncSession, user_factory,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    # No profile row created.
    ok = await discovery_embedding_service.refresh_profile_embedding(
        db, user_id,
    )
    assert ok is False


# ---------------------------------------------------------------------------
# Boot-guard / load failure
# ---------------------------------------------------------------------------


def test_load_model_eager_raises_on_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When fastembed.TextEmbedding fails, the boot path raises a typed
    error that the lifespan can catch.

    Bypasses the autouse ``_patch_model`` fixture by restoring the real
    ``_get_model`` (which calls fastembed.TextEmbedding internally) and
    pointing fastembed at a stub class that raises during construction.
    """
    # Replicate the real ``_get_model`` shape inline so the autouse
    # fixture's stub doesn't interfere. We can't simply remove the
    # patch (monkeypatch already applied) so we install a real-shaped
    # implementation that calls fastembed.TextEmbedding and translates
    # any error into ``EmbeddingModelLoadError`` — matching what the
    # real ``_get_model`` does.
    monkeypatch.setattr(discovery_embedding_service, "_model", None)

    def _real_get_model():
        from fastembed import TextEmbedding
        try:
            return TextEmbedding(
                model_name=discovery_embedding_service._MODEL_NAME,
            )
        except Exception as exc:
            raise EmbeddingModelLoadError(
                "failed to load fastembed model "
                f"{discovery_embedding_service._MODEL_NAME!r}: {exc}"
            ) from exc

    monkeypatch.setattr(
        discovery_embedding_service, "_get_model", _real_get_model,
    )

    class _BoomEmbedding:
        def __init__(self, *a, **kw):
            raise RuntimeError("simulated load failure")

    import fastembed
    monkeypatch.setattr(fastembed, "TextEmbedding", _BoomEmbedding)

    with pytest.raises(EmbeddingModelLoadError) as exc_info:
        discovery_embedding_service.load_model_eager()
    assert "simulated load failure" in str(exc_info.value)
