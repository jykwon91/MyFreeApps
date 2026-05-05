"""Tests for rent_receipt_sequence_repo.

Covers:
- format_receipt_number produces the expected string format (pure function, no DB).
- next_number atomically increments and returns the sequence value (integration,
  requires a real PostgreSQL database — skipped when running on SQLite).
"""
from __future__ import annotations

import os
import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio

from app.repositories.leases import rent_receipt_sequence_repo

_IS_SQLITE = "sqlite" in os.environ.get("DATABASE_URL", "sqlite")


class TestFormatReceiptNumber:
    def test_pads_to_four_digits(self) -> None:
        assert rent_receipt_sequence_repo.format_receipt_number(2026, 1) == "R-2026-0001"

    def test_handles_large_number(self) -> None:
        assert rent_receipt_sequence_repo.format_receipt_number(2026, 9999) == "R-2026-9999"

    def test_different_year(self) -> None:
        assert rent_receipt_sequence_repo.format_receipt_number(2027, 42) == "R-2027-0042"

    def test_max_padding_ten_thousand(self) -> None:
        # Numbers >9999 still render correctly (no zero-padding).
        assert rent_receipt_sequence_repo.format_receipt_number(2026, 10000) == "R-2026-10000"


# ---------------------------------------------------------------------------
# Integration tests — PostgreSQL only
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture()
async def pg_session_with_user() -> AsyncGenerator[tuple, None]:
    """Open a real PostgreSQL session and seed a temporary user row.

    Yields ``(session, user_id, sequence_years)`` and cleans up both sequence
    rows and the temporary user row on exit.  The hashed_password sentinel
    is intentionally non-bcrypt — this user is never authenticated, it exists
    only to satisfy the FK constraint on rent_receipt_sequences.user_id.
    """
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import settings

    engine = create_async_engine(settings.database_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    user_id = uuid.uuid4()
    sequence_years: list[int] = []

    async with factory() as session:
        # Insert a throwaway user to satisfy the FK constraint.
        await session.execute(
            text(
                "INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, role) "
                "VALUES (:id, :email, '$test$', true, false, true, 'USER')"
            ),
            {"id": str(user_id), "email": f"test-seq-{user_id}@integration.test"},
        )
        await session.commit()

        try:
            yield session, user_id, sequence_years
        finally:
            # Clean up sequence rows first (FK: sequences → users).
            for year in sequence_years:
                await session.execute(
                    text(
                        "DELETE FROM rent_receipt_sequences WHERE user_id = :uid AND year = :year"
                    ),
                    {"uid": str(user_id), "year": year},
                )
            await session.execute(
                text("DELETE FROM users WHERE id = :id"),
                {"id": str(user_id)},
            )
            await session.commit()

    await engine.dispose()


@pytest.mark.skipif(
    _IS_SQLITE,
    reason="next_number uses PostgreSQL-specific UPSERT; requires a real Postgres instance",
)
class TestNextNumber:
    """Integration tests for next_number() against a real PostgreSQL database.

    Each test uses a fresh (user_id, year) pair seeded by the fixture so
    parallel test runs don't interfere and production data is never touched.
    """

    @pytest.mark.asyncio
    async def test_first_call_returns_one(self, pg_session_with_user: tuple) -> None:
        """First call for a new (user_id, year) pair returns 1."""
        session, user_id, sequence_years = pg_session_with_user
        year = 2000
        sequence_years.append(year)

        result = await rent_receipt_sequence_repo.next_number(
            session, user_id=user_id, year=year
        )
        await session.commit()

        assert result == 1

    @pytest.mark.asyncio
    async def test_sequential_calls_increment(self, pg_session_with_user: tuple) -> None:
        """Consecutive calls within the same (user_id, year) increment by 1 each time."""
        session, user_id, sequence_years = pg_session_with_user
        year = 2001
        sequence_years.append(year)

        first = await rent_receipt_sequence_repo.next_number(
            session, user_id=user_id, year=year
        )
        await session.commit()

        second = await rent_receipt_sequence_repo.next_number(
            session, user_id=user_id, year=year
        )
        await session.commit()

        third = await rent_receipt_sequence_repo.next_number(
            session, user_id=user_id, year=year
        )
        await session.commit()

        assert first == 1
        assert second == 2
        assert third == 3

    @pytest.mark.asyncio
    async def test_year_rollover_resets_to_one(self, pg_session_with_user: tuple) -> None:
        """A different year for the same user_id starts its own sequence at 1."""
        session, user_id, sequence_years = pg_session_with_user
        year_a, year_b = 2002, 2003
        sequence_years.extend([year_a, year_b])

        # Advance year_a sequence a few times.
        for _ in range(3):
            await rent_receipt_sequence_repo.next_number(
                session, user_id=user_id, year=year_a
            )
            await session.commit()

        # year_b must start at 1, independent of year_a.
        result_b = await rent_receipt_sequence_repo.next_number(
            session, user_id=user_id, year=year_b
        )
        await session.commit()

        assert result_b == 1

    @pytest.mark.asyncio
    async def test_different_users_have_independent_sequences(
        self,
        pg_session_with_user: tuple,
    ) -> None:
        """Two users' sequences are isolated — one user's counter does not affect the other."""
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

        from app.core.config import settings

        session, user_id_a, sequence_years = pg_session_with_user
        year = 2004
        sequence_years.append(year)

        # Create a second throwaway user for this test.
        engine_b = create_async_engine(settings.database_url, echo=False)
        factory_b = async_sessionmaker(engine_b, expire_on_commit=False)
        user_id_b = uuid.uuid4()

        async with factory_b() as session_b:
            await session_b.execute(
                text(
                    "INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, role) "
                    "VALUES (:id, :email, '$test$', true, false, true, 'USER')"
                ),
                {"id": str(user_id_b), "email": f"test-seq-{user_id_b}@integration.test"},
            )
            await session_b.commit()

            # Advance user_a twice.
            await rent_receipt_sequence_repo.next_number(session, user_id=user_id_a, year=year)
            await session.commit()
            await rent_receipt_sequence_repo.next_number(session, user_id=user_id_a, year=year)
            await session.commit()

            # user_b's first call must still return 1.
            result_b = await rent_receipt_sequence_repo.next_number(
                session_b, user_id=user_id_b, year=year
            )
            await session_b.commit()

            assert result_b == 1

            # Clean up user_b's sequence and user row.
            await session_b.execute(
                text("DELETE FROM rent_receipt_sequences WHERE user_id = :uid AND year = :year"),
                {"uid": str(user_id_b), "year": year},
            )
            await session_b.execute(
                text("DELETE FROM users WHERE id = :id"),
                {"id": str(user_id_b)},
            )
            await session_b.commit()

        await engine_b.dispose()
