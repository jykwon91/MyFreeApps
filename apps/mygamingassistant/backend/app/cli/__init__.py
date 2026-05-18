"""CLI entry point for MyGamingAssistant backend.

Usage:
    python -m app.cli load-fixtures
    python -m app.cli backfill-clips
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


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""

    if command == "load-fixtures":
        from app.services.game.fixture_loader import load_fixtures_standalone
        asyncio.run(load_fixtures_standalone())
        print("Fixtures loaded successfully.")
    elif command == "backfill-clips":
        sys.exit(asyncio.run(_run_backfill_clips()))
    else:
        print(f"Unknown command: {command!r}")
        print("Available commands:")
        print("  load-fixtures   — load game taxonomy fixtures into the database")
        print("  backfill-clips  — generate clips for accepted lineups missing one")
        sys.exit(1)


if __name__ == "__main__":
    main()
