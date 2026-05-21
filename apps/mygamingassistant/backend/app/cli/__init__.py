"""CLI entry point for MyGamingAssistant backend.

Usage:
    python -m app.cli load-fixtures
    python -m app.cli backfill-clips
    python -m app.cli backfill-technique
    python -m app.cli backfill-landing-clips
"""
import asyncio
import sys


async def _run_backfill_clips() -> int:
    """Generate clips for accepted lineups missing one. Returns an exit code.

    Idempotent — safe to re-run; only lineups with ``clip_url IS NULL`` are
    touched. A non-zero exit signals at least one hard failure so the
    operator notices (re-running retries them — they are not fatal).
    """
    from app.db.session import AsyncSessionLocal
    from app.services.ingestion.clip_backfill import backfill_clips

    async with AsyncSessionLocal() as db:
        stats = await backfill_clips(db)

    print(stats.summary())
    if stats.errors:
        print(f"  {len(stats.errors)} issue(s):")
        for err in stats.errors:
            print(f"   - {err}")
    # Re-runnable: failures retry next run, so a non-zero exit is advisory.
    return 1 if stats.failed else 0


async def _run_backfill_technique() -> int:
    """Name throw-technique for accepted lineups missing one. Exit code.

    Idempotent — safe to re-run; only lineups with ``technique IS NULL`` are
    touched. Independent of ``backfill-clips`` (separate NULL column). A
    non-zero exit signals at least one hard failure so the operator notices
    (re-running retries them — they are not fatal).
    """
    from app.db.session import AsyncSessionLocal
    from app.services.ingestion.technique_backfill import backfill_technique

    async with AsyncSessionLocal() as db:
        stats = await backfill_technique(db)

    print(stats.summary())
    if stats.errors:
        print(f"  {len(stats.errors)} issue(s):")
        for err in stats.errors:
            print(f"   - {err}")
    # Re-runnable: failures retry next run, so a non-zero exit is advisory.
    return 1 if stats.failed else 0


async def _run_backfill_landing_clips() -> int:
    """Generate landing clips for accepted lineups missing one. Exit code.

    Idempotent — safe to re-run; only lineups with ``landing_clip_url IS
    NULL`` are touched. Independent of ``backfill-clips`` and
    ``backfill-technique`` (separate NULL column). A non-zero exit signals
    at least one hard failure so the operator notices (re-running retries
    them — they are not fatal).
    """
    from app.db.session import AsyncSessionLocal
    from app.services.ingestion.landing_clip_backfill import (
        backfill_landing_clips,
    )

    async with AsyncSessionLocal() as db:
        stats = await backfill_landing_clips(db)

    print(stats.summary())
    if stats.errors:
        print(f"  {len(stats.errors)} issue(s):")
        for err in stats.errors:
            print(f"   - {err}")
    # Re-runnable: failures retry next run, so a non-zero exit is advisory.
    return 1 if stats.failed else 0


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""

    if command == "load-fixtures":
        from app.services.game.fixture_loader import load_fixtures_standalone
        asyncio.run(load_fixtures_standalone())
        print("Fixtures loaded successfully.")
    elif command == "backfill-clips":
        sys.exit(asyncio.run(_run_backfill_clips()))
    elif command == "backfill-technique":
        sys.exit(asyncio.run(_run_backfill_technique()))
    elif command == "backfill-landing-clips":
        sys.exit(asyncio.run(_run_backfill_landing_clips()))
    else:
        print(f"Unknown command: {command!r}")
        print("Available commands:")
        print("  load-fixtures          — load game taxonomy fixtures into the database")
        print("  backfill-clips         — generate clips for accepted lineups missing one")
        print("  backfill-technique     — name throw-technique for accepted lineups missing one")
        print("  backfill-landing-clips — generate landing clips for accepted lineups missing one")
        sys.exit(1)


if __name__ == "__main__":
    main()
