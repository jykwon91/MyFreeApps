"""Triage WoW Forever feature requests against the live (or local) API.

Run from ``apps/mygamingassistant/backend``::

    python -m scripts.wow_feature_triage inbox [--json]
    python -m scripts.wow_feature_triage stories [--status open --status planned] [--json]
    python -m scripts.wow_feature_triage apply plan.json          # preview only
    python -m scripts.wow_feature_triage apply plan.json --yes    # preview, then apply

The base URL and token come from ``backend/.env.triage`` (gitignored). See
``apps/mygamingassistant/docs/wow-forever-feature-triage.md``.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from scripts.wow_feature_triage.triage_api_error import TriageApiError
from scripts.wow_feature_triage.triage_apply import apply_plan
from scripts.wow_feature_triage.triage_client import TriageClient
from scripts.wow_feature_triage.triage_config import DEFAULT_ENV_FILE, load_config
from scripts.wow_feature_triage.triage_plan import load_plan
from scripts.wow_feature_triage.triage_render import render_inbox, render_plan, render_stories

EXIT_API_ERROR = 2
UNKNOWN_ROUTE_DETAIL = "Not Found"
STALE_HINT = "A story changed since it was read (a vote or another triage run). Re-run `stories` and update the plan."
NOT_FOUND_HINT = "404: wrong token, or the triage API isn't enabled on this server (WOW_FEATURE_TRIAGE_TOKEN unset)."


def _print_json(value: object) -> None:
    print(json.dumps(value, indent=2, ensure_ascii=False))


def _apply(client: TriageClient, plan_path: Path, *, confirmed: bool) -> None:
    plan = load_plan(plan_path)
    if plan.is_empty():
        print("The plan is empty; nothing to do.")
        return
    stories = {story["id"]: story for story in client.stories()}
    print("\n".join(render_plan(plan, stories)))
    if not confirmed:
        print("\nPreview only. Re-run with --yes to apply.")
        return
    print("")
    apply_plan(client, plan, stories, print)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m scripts.wow_feature_triage", description=__doc__.splitlines()[0])
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE, help=argparse.SUPPRESS)
    commands = parser.add_subparsers(dest="command", required=True)
    inbox = commands.add_parser("inbox", help="untriaged submissions, oldest first")
    inbox.add_argument("--json", action="store_true")
    stories = commands.add_parser("stories", help="every story, private fields included")
    stories.add_argument("--status", action="append", default=None)
    stories.add_argument("--json", action="store_true")
    apply = commands.add_parser("apply", help="preview a plan file; --yes applies it")
    apply.add_argument("plan", type=Path)
    apply.add_argument("--yes", action="store_true", help="apply after printing the preview")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    config = load_config(args.env_file)
    try:
        with TriageClient(config) as client:
            if args.command == "apply":
                _apply(client, args.plan, confirmed=args.yes)
            elif args.json:
                _print_json(client.inbox() if args.command == "inbox" else client.stories(args.status))
            elif args.command == "inbox":
                print(render_inbox(client.inbox()))
            else:
                print(render_stories(client.stories(args.status)))
    except TriageApiError as exc:
        print(f"error: {exc}", file=sys.stderr)
        if exc.status_code == 412:
            print(STALE_HINT, file=sys.stderr)
        elif exc.status_code == 404 and exc.detail == UNKNOWN_ROUTE_DETAIL:
            print(NOT_FOUND_HINT, file=sys.stderr)
        return EXIT_API_ERROR
    return 0


if __name__ == "__main__":
    sys.exit(main())
