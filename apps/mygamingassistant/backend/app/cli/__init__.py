"""CLI entry point for MyGamingAssistant backend.

Usage:
    python -m app.cli load-fixtures
    python -m app.cli import-lineups [pack.json]
    python -m app.cli import-wow-captures [pack.json]
    python -m app.cli export-wow-captures [pack.json]
    python -m app.cli backfill-clips
    python -m app.cli backfill-technique
    python -m app.cli backfill-landing-clips
    python -m app.cli backfill-micro-clips
    python -m app.cli backfill-posters
    python -m app.cli widen-source
    python -m app.cli discord-register-commands [--guild GUILD_ID]
"""
import asyncio
import sys
from pathlib import Path


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


async def _run_widen_source() -> int:
    """Widen the trim-editor source for lineups still on the legacy posture
    (``*_url_original`` equals the tight ``*_url``). Exit code.

    Idempotent — safe to re-run; only panes whose tight still equals their
    wide are touched. Independent of the other backfills (separate columns,
    separate work set). A non-zero exit signals at least one hard failure
    so the operator notices (re-running retries them — they are not fatal).
    """
    from app.db.session import AsyncSessionLocal
    from app.services.ingestion.widen_source_backfill import (
        backfill_widen_source,
    )

    async with AsyncSessionLocal() as db:
        stats = await backfill_widen_source(db)

    print(stats.summary())
    if stats.errors:
        print(f"  {len(stats.errors)} issue(s):")
        for err in stats.errors:
            print(f"   - {err}")
    # Re-runnable: failures retry next run, so a non-zero exit is advisory.
    return 1 if stats.failed else 0


async def _run_backfill_micro_clips() -> int:
    """Generate stand + aim micro-clips for accepted lineups missing one.
    Returns an exit code.

    Idempotent — safe to re-run; only lineups with at least one of
    ``stand_clip_url`` / ``aim_clip_url`` NULL are touched. Independent of
    ``backfill-clips`` / ``backfill-landing-clips`` (separate NULL columns).
    A non-zero exit signals at least one hard failure on either side so the
    operator notices (re-running retries them — they are not fatal).
    """
    from app.db.session import AsyncSessionLocal
    from app.services.ingestion.micro_clip_backfill import (
        backfill_micro_clips,
    )

    async with AsyncSessionLocal() as db:
        stats = await backfill_micro_clips(db)

    print(stats.summary())
    if stats.errors:
        print(f"  {len(stats.errors)} issue(s):")
        for err in stats.errors:
            print(f"   - {err}")
    # Re-runnable: failures retry next run, so a non-zero exit is advisory.
    return 1 if stats.failed else 0


async def _run_backfill_posters() -> int:
    """Generate STAND + LANDING poster stills for accepted lineups missing one.
    Returns an exit code.

    Idempotent — safe to re-run; only lineups that have a clip but whose
    screenshot column isn't yet a ``*-poster.webp`` key are touched.
    Independent of the clip backfills (posters derive from already-uploaded
    clips — no video is re-fetched). A non-zero exit signals at least one hard
    failure on either side so the operator notices (re-running retries them —
    they are not fatal).
    """
    from app.db.session import AsyncSessionLocal
    from app.services.ingestion.poster_backfill import backfill_posters

    async with AsyncSessionLocal() as db:
        stats = await backfill_posters(db)

    print(stats.summary())
    if stats.errors:
        print(f"  {len(stats.errors)} issue(s):")
        for err in stats.errors:
            print(f"   - {err}")
    # Re-runnable: failures retry next run, so a non-zero exit is advisory.
    return 1 if stats.failed else 0


def _run_discord_register_commands() -> int:
    """Register MGA slash commands with Discord.  Returns an exit code.

    Parses an optional ``--guild GUILD_ID`` flag from sys.argv.  When a guild
    ID is provided (or settings.discord_dev_guild_id is set) the commands are
    registered as guild commands (instant propagation, <1s).  Otherwise they
    are registered as global commands (~1h propagation).

    The global overwrite keeps the Activity's ``PRIMARY_ENTRY_POINT`` launch
    command when one exists (Discord creates it when Activities is enabled and
    rejects any bulk overwrite that omits it); it never creates one.

    No-op with a clear message when DISCORD_ENABLED=false so a post-deploy
    step before the operator has configured Discord does not break the deploy.
    A Discord API rejection prints status + error code and exits 1.

    Usage (in-container):
        python -m app.cli discord-register-commands
        python -m app.cli discord-register-commands --guild 1234567890
    """
    from app.core.config import settings
    from app.services.discord.commands_spec import ALL_COMMANDS
    from platform_shared.services.discord.client import DiscordApiError, DiscordRestClient
    from platform_shared.services.discord.commands import (
        ENTRY_POINT_REMOVAL_REJECTED,
        is_entry_point_command,
        overwrite_global_commands_preserving_entry_point,
    )

    if not settings.discord_enabled:
        print(
            "DISCORD_ENABLED=false — skipping command registration. "
            "Set DISCORD_ENABLED=true and the required DISCORD_* vars to activate."
        )
        return 0  # non-fatal: post-deploy must not break an unconfigured app

    # Validate required settings before attempting the API call.
    missing = [
        name
        for name, val in [
            ("DISCORD_APPLICATION_ID", settings.discord_application_id),
            ("DISCORD_BOT_TOKEN", settings.discord_bot_token),
        ]
        if not val
    ]
    if missing:
        print(
            f"discord-register-commands: DISCORD_ENABLED=true but the following "
            f"required vars are not set: {', '.join(missing)}. "
            "Set them in apps/mygamingassistant/backend/.env.docker."
        )
        return 1

    # Parse --guild flag from remaining argv (after the command name).
    guild_id: str = settings.discord_dev_guild_id
    args = sys.argv[2:]
    idx = 0
    while idx < len(args):
        if args[idx] == "--guild" and idx + 1 < len(args):
            guild_id = args[idx + 1]
            idx += 2
        else:
            print(f"discord-register-commands: unknown argument {args[idx]!r}")
            return 1

    async def _register() -> list[dict]:
        async with DiscordRestClient(settings.discord_bot_token) as client:
            if guild_id:
                print(
                    f"Registering {len(ALL_COMMANDS)} command(s) to guild {guild_id} "
                    "(instant propagation)..."
                )
                return await client.bulk_overwrite_guild_commands(
                    settings.discord_application_id, guild_id, ALL_COMMANDS
                )
            print(
                f"Registering {len(ALL_COMMANDS)} command(s) globally "
                "(may take up to ~1h to propagate)..."
            )
            return await overwrite_global_commands_preserving_entry_point(
                client, settings.discord_application_id, ALL_COMMANDS
            )

    try:
        registered = asyncio.run(_register())
    except DiscordApiError as exc:
        print(
            f"discord-register-commands: Discord rejected the request "
            f"(status={exc.status} code={exc.code}): {exc.message}"
        )
        if exc.code == ENTRY_POINT_REMOVAL_REJECTED:
            print(
                "  The overwrite would have removed the Activity's entry-point "
                "(Launch) command — Activities was likely enabled mid-run. Re-run "
                "this command; it re-reads the registered commands first."
            )
        return 1
    for cmd in registered:
        kept = " — Activity entry point, kept" if is_entry_point_command(cmd) else ""
        print(f"  /{cmd.get('name')} (id={cmd.get('id')}){kept}")
    print(f"Done — {len(registered)} command(s) registered.")
    return 0


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""

    if command == "load-fixtures":
        from app.services.game.fixture_loader import load_fixtures_standalone
        asyncio.run(load_fixtures_standalone())
        print("Fixtures loaded successfully.")
    elif command == "import-lineups":
        # Seeds the public read-only library from the image-baked pack
        # (apps/.../backend/data/lineup_library.json → /app/data/...). Run
        # AFTER load-fixtures (it resolves the pack's game/map/zone/utility
        # slugs against the seeded taxonomy). Optional path arg overrides the
        # baked default. See app/services/game/lineup_importer.py.
        from app.services.game.lineup_importer import import_lineups_standalone
        pack_path = sys.argv[2] if len(sys.argv) > 2 else None
        stats = asyncio.run(import_lineups_standalone(pack_path))
        print(stats.summary())
    elif command == "import-wow-captures":
        # Mirrors the World Map capture pack (backend/data/wow_map_captures.json)
        # into the database — the serve-only prod half of the capture flow.
        from app.services.wow.map_capture_service import import_pack
        pack_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None
        print(asyncio.run(import_pack(pack_path)).summary())
    elif command == "export-wow-captures":
        # Local: write every stored capture to the pack, then commit it.
        from app.services.wow.map_capture_service import export_pack
        pack_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None
        print(f"Wrote {asyncio.run(export_pack(pack_path))} World Map capture(s) to the pack.")
    elif command == "backfill-clips":
        sys.exit(asyncio.run(_run_backfill_clips()))
    elif command == "backfill-technique":
        sys.exit(asyncio.run(_run_backfill_technique()))
    elif command == "backfill-landing-clips":
        sys.exit(asyncio.run(_run_backfill_landing_clips()))
    elif command == "backfill-micro-clips":
        sys.exit(asyncio.run(_run_backfill_micro_clips()))
    elif command == "backfill-posters":
        sys.exit(asyncio.run(_run_backfill_posters()))
    elif command == "widen-source":
        sys.exit(asyncio.run(_run_widen_source()))
    elif command == "discord-register-commands":
        sys.exit(_run_discord_register_commands())
    else:
        print(f"Unknown command: {command!r}")
        print("Available commands:")
        print("  load-fixtures          — load game taxonomy fixtures into the database")
        print("  import-lineups [pack]  — seed the public library from a published pack (after load-fixtures)")
        print("  import-wow-captures [pack] — mirror the World Map capture pack into the database")
        print("  export-wow-captures [pack] — write stored World Map captures to the pack (local)")
        print("  backfill-clips         — generate clips for accepted lineups missing one")
        print("  backfill-technique     — name throw-technique for accepted lineups missing one")
        print("  backfill-landing-clips — generate landing clips for accepted lineups missing one")
        print("  backfill-micro-clips   — generate stand + aim micro-clips for accepted lineups missing one")
        print("  backfill-posters       — generate stand + landing poster stills for accepted lineups missing one")
        print("  widen-source           — replace tight=wide pairs with a wider trim-editor source")
        print("  discord-register-commands [--guild GUILD_ID]")
        print("                         — register slash commands with Discord (no-op when DISCORD_ENABLED=false)")
        sys.exit(1)


if __name__ == "__main__":
    main()
