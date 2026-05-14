"""CLI entry point for __APP_DISPLAY_NAME__ backend.

Add app-specific commands below.

Usage:
    python -m app.cli <command>
"""
import sys


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""

    if not command:
        print("Available commands: (none yet)")
        print("Add commands in app/cli/__init__.py")
        sys.exit(0)

    print(f"Unknown command: {command!r}")
    sys.exit(1)


if __name__ == "__main__":
    main()
