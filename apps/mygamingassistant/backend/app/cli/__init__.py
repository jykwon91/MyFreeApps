"""CLI entry point for MyGamingAssistant backend.

Usage:
    python -m app.cli load-fixtures
"""
import asyncio
import sys


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""

    if command == "load-fixtures":
        from app.services.game.fixture_loader import load_fixtures_standalone
        asyncio.run(load_fixtures_standalone())
        print("Fixtures loaded successfully.")
    else:
        print(f"Unknown command: {command!r}")
        print("Available commands:")
        print("  load-fixtures   — load game taxonomy fixtures into the database")
        sys.exit(1)


if __name__ == "__main__":
    main()
