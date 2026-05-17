"""Package entry point so ``python -m app.cli <command>`` works.

``app.cli`` is a package, so ``python -m app.cli`` requires this module to
exist — without it the documented command (CLAUDE.md, the deploy runbook's
``docker compose ... exec api python -m app.cli load-fixtures``) fails with
"'app.cli' is a package and cannot be directly executed".
"""
from app.cli import main

if __name__ == "__main__":
    main()
