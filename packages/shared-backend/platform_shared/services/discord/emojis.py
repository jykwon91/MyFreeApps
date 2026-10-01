"""Discord application emojis — versioned asset sync + an in-process registry.

Why application emojis
----------------------
An app can own up to 2000 custom emojis that work in every guild it is
installed in — no server emoji slots, no Manage Emojis permission.  Bots use
them as icons in message text / embeds (``<:name:id>``) and on buttons and
select options (``{"id": ..., "name": ...}``).

Versioned names
---------------
Each PNG in an app's emoji directory is one emoji.  Its Discord name is
``<logical>__<version>``: the file stem plus the first six hex characters of
the image's SHA-256.  Changing the art changes the name, so
:func:`sync_application_emojis` uploads the new image on the next deploy with
no force flag.  The previous version is kept so messages already posted with
it keep their icons; older versions are pruned.

Renderers never see versions.  :class:`EmojiSet` maps logical names to the
emoji to show; a name with no uploaded emoji falls back to the caller's text
or Unicode, so a deploy whose sync has not run yet still renders.

:class:`EmojiRegistry` keeps one :class:`EmojiSet` per process.  It refreshes
in the background (never on the request path).  It refreshes again soon while
the current art is not all uploaded yet: the API starts before the
post-deploy sync runs.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import re
import time
from collections.abc import Awaitable, Callable, Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Final

import httpx

from platform_shared.services.discord.client import DiscordApiError, DiscordRestClient

logger = logging.getLogger(__name__)

MAX_IMAGE_BYTES: Final = 256 * 1024
"""Discord's limit for an emoji image."""

VERSION_SEPARATOR: Final = "__"
VERSION_CHARS: Final = 6
MAX_LOGICAL_NAME_CHARS: Final = 32 - len(VERSION_SEPARATOR) - VERSION_CHARS

KEEP_VERSIONS: Final = 2
"""Versions kept per logical name: the current art plus the one before it."""

_LOGICAL_NAME: Final = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)*$")
_VERSIONED_NAME: Final = re.compile(
    rf"^(?P<logical>[a-z0-9_]+){VERSION_SEPARATOR}(?P<version>[0-9a-f]{{{VERSION_CHARS}}})$"
)
_PNG_SIGNATURE: Final = b"\x89PNG\r\n\x1a\n"


# ---------------------------------------------------------------------------
# Assets (the committed PNGs)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EmojiAsset:
    """One committed emoji image."""

    logical_name: str
    image: bytes

    @property
    def version(self) -> str:
        return hashlib.sha256(self.image).hexdigest()[:VERSION_CHARS]

    @property
    def emoji_name(self) -> str:
        """The Discord emoji name for this exact art, e.g. ``warrior__3fa2c1``."""
        return f"{self.logical_name}{VERSION_SEPARATOR}{self.version}"

    def data_uri(self) -> str:
        return "data:image/png;base64," + base64.b64encode(self.image).decode("ascii")


def validate_logical_name(name: str) -> None:
    """Raise ``ValueError`` unless ``name`` can carry a version suffix."""
    if not _LOGICAL_NAME.match(name):
        raise ValueError(
            f"emoji name {name!r} must be lowercase letters/digits separated by single underscores"
        )
    if len(name) < 2 or len(name) > MAX_LOGICAL_NAME_CHARS:
        raise ValueError(f"emoji name {name!r} must be 2-{MAX_LOGICAL_NAME_CHARS} characters")


def load_assets(directory: Path) -> dict[str, EmojiAsset]:
    """Every ``*.png`` in ``directory`` (not recursive), keyed by logical name.

    Raises ``ValueError`` for a file Discord would reject (bad name, not a
    PNG, over 256 KiB), so a bad asset fails tests/CI instead of a deploy.
    """
    assets: dict[str, EmojiAsset] = {}
    for path in sorted(directory.glob("*.png")):
        validate_logical_name(path.stem)
        image = path.read_bytes()
        if not image.startswith(_PNG_SIGNATURE):
            raise ValueError(f"{path.name} is not a PNG")
        if len(image) > MAX_IMAGE_BYTES:
            raise ValueError(f"{path.name} is {len(image)} bytes; Discord allows {MAX_IMAGE_BYTES}")
        assets[path.stem] = EmojiAsset(path.stem, image)
    return assets


def expected_names(assets: Mapping[str, EmojiAsset]) -> dict[str, str]:
    """logical name → the versioned Discord name of the current art."""
    return {logical: asset.emoji_name for logical, asset in assets.items()}


def split_emoji_name(name: str) -> tuple[str, str | None]:
    """``("warrior", "3fa2c1")`` for a versioned name, ``(name, None)`` otherwise."""
    match = _VERSIONED_NAME.match(name)
    if match is None:
        return name, None
    return match["logical"], match["version"]


# ---------------------------------------------------------------------------
# EmojiSet — what renderers use
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EmojiRef:
    id: str
    name: str


@dataclass(frozen=True)
class EmojiSet:
    """Immutable logical-name → emoji lookup.  Pure; safe to share."""

    by_logical: Mapping[str, EmojiRef] = field(default_factory=dict)

    def has(self, logical: str) -> bool:
        return logical in self.by_logical

    def markup(self, logical: str, fallback: str = "") -> str:
        """``<:warrior__3fa2c1:123>`` for message text, else ``fallback``."""
        ref = self.by_logical.get(logical)
        if ref is None:
            return fallback
        return f"<:{ref.name}:{ref.id}>"

    def component(self, logical: str, fallback_unicode: str | None = None) -> dict[str, str] | None:
        """The ``emoji`` object for a button / select option, or ``None``.

        Falls back to ``{"name": fallback_unicode}`` (a standard Unicode
        emoji) when the custom one is missing and a fallback is given.
        """
        ref = self.by_logical.get(logical)
        if ref is not None:
            return {"id": ref.id, "name": ref.name}
        if fallback_unicode:
            return {"name": fallback_unicode}
        return None


EMPTY_EMOJIS: Final = EmojiSet()


def resolve_emoji_set(
    remote: Iterable[Mapping[str, Any]],
    expected: Mapping[str, str] | None = None,
) -> EmojiSet:
    """Build the lookup from Discord's emoji list.

    For each logical name, use the exact current version (``expected``) when it
    is uploaded, else the newest uploaded version (highest snowflake), so a
    deploy that changed the art keeps showing the old icon until the sync
    lands.  Emojis without a version suffix are listed under their own name.
    """
    expected = expected or {}
    exact: dict[str, EmojiRef] = {}
    newest: dict[str, tuple[int, EmojiRef]] = {}
    for emoji in remote:
        name = str(emoji.get("name") or "")
        emoji_id = str(emoji.get("id") or "")
        if not name or not emoji_id.isdigit():
            continue
        logical, _ = split_emoji_name(name)
        ref = EmojiRef(id=emoji_id, name=name)
        if expected.get(logical) == name:
            exact[logical] = ref
        snowflake = int(emoji_id)
        current = newest.get(logical)
        if current is None or snowflake > current[0]:
            newest[logical] = (snowflake, ref)
    resolved = {logical: ref for logical, (_, ref) in newest.items()}
    resolved.update(exact)
    return EmojiSet(by_logical=resolved)


def missing_expected(emojis: EmojiSet, expected: Mapping[str, str]) -> list[str]:
    """Logical names whose current art is not what ``emojis`` resolves to."""
    return sorted(
        logical
        for logical, name in expected.items()
        if (ref := emojis.by_logical.get(logical)) is None or ref.name != name
    )


# ---------------------------------------------------------------------------
# Sync (post-deploy)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SyncReport:
    uploaded: tuple[str, ...]
    unchanged: tuple[str, ...]
    pruned: tuple[str, ...]
    failed: tuple[tuple[str, str], ...]
    """``(emoji name, reason)`` for every upload or delete Discord refused."""

    @property
    def ok(self) -> bool:
        return not self.failed


def stale_versions(
    remote: Iterable[Mapping[str, Any]],
    assets: Mapping[str, EmojiAsset],
    *,
    keep: int = KEEP_VERSIONS,
) -> list[Mapping[str, Any]]:
    """Uploaded versions of current assets beyond the newest ``keep``.

    The current art always counts as kept.  Unversioned emojis and logical
    names with no current asset are never returned — this only cleans up
    after itself.
    """
    by_logical: dict[str, list[Mapping[str, Any]]] = {}
    for emoji in remote:
        logical, version = split_emoji_name(str(emoji.get("name") or ""))
        if version is None or logical not in assets or not str(emoji.get("id") or "").isdigit():
            continue
        by_logical.setdefault(logical, []).append(emoji)

    stale: list[Mapping[str, Any]] = []
    for logical, versions in by_logical.items():
        current_name = assets[logical].emoji_name
        current = [emoji for emoji in versions if emoji.get("name") == current_name]
        older = sorted(
            (emoji for emoji in versions if emoji.get("name") != current_name),
            key=lambda emoji: int(str(emoji["id"])),
            reverse=True,
        )
        kept = len(current)
        for emoji in older:
            if kept < keep:
                kept += 1
            else:
                stale.append(emoji)
    return stale


async def sync_application_emojis(
    client: DiscordRestClient,
    application_id: str,
    assets: Mapping[str, EmojiAsset],
    *,
    dry_run: bool = False,
) -> SyncReport:
    """Upload every asset whose current version is missing; prune old versions.

    A failed listing raises :class:`DiscordApiError` before any write.  A
    refused upload or delete is recorded in the report and the sync carries
    on, so one bad image never blocks the rest.
    """
    remote = await client.list_application_emojis(application_id)
    present = {str(emoji.get("name")) for emoji in remote}

    uploaded: list[str] = []
    unchanged: list[str] = []
    failed: list[tuple[str, str]] = []
    after_upload: list[Mapping[str, Any]] = list(remote)
    for logical in sorted(assets):
        asset = assets[logical]
        if asset.emoji_name in present:
            unchanged.append(asset.emoji_name)
            continue
        if dry_run:
            uploaded.append(asset.emoji_name)
            after_upload.append({"name": asset.emoji_name, "id": "0"})  # counts as kept
            continue
        try:
            created = await client.create_application_emoji(application_id, asset.emoji_name, asset.data_uri())
        except DiscordApiError as exc:
            logger.warning(
                "Discord refused emoji upload name=%s status=%s code=%s",
                asset.emoji_name, exc.status, exc.code,
            )
            failed.append((asset.emoji_name, f"status={exc.status} code={exc.code} {exc.message}"))
            continue
        uploaded.append(asset.emoji_name)
        after_upload.append(created)

    pruned: list[str] = []
    for emoji in stale_versions(after_upload, assets):
        name = str(emoji.get("name"))
        if dry_run:
            pruned.append(name)
            continue
        try:
            await client.delete_application_emoji(application_id, str(emoji["id"]))
        except DiscordApiError as exc:
            logger.warning(
                "Discord refused emoji delete name=%s status=%s code=%s", name, exc.status, exc.code,
            )
            failed.append((name, f"delete status={exc.status} code={exc.code} {exc.message}"))
            continue
        pruned.append(name)

    return SyncReport(
        uploaded=tuple(uploaded),
        unchanged=tuple(unchanged),
        pruned=tuple(pruned),
        failed=tuple(failed),
    )


# ---------------------------------------------------------------------------
# Registry (per process)
# ---------------------------------------------------------------------------


Fetch = Callable[[], Awaitable[list[dict[str, Any]]]]


class EmojiRegistry:
    """The process's current :class:`EmojiSet`, refreshed in the background.

    ``current()`` never blocks: it returns the last good set and, when that
    set is stale, starts one refresh task on the running event loop.  A
    failed refresh keeps the last good set and retries after ``retry_s``.
    While any current art is missing remotely (the deploy's sync has not run
    yet), the set is refreshed every ``retry_s`` instead of ``ttl_s``.
    """

    def __init__(
        self,
        fetch: Fetch,
        *,
        expected: Mapping[str, str] | None = None,
        ttl_s: float = 600.0,
        retry_s: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._fetch = fetch
        self._expected = dict(expected or {})
        self._ttl_s = ttl_s
        self._retry_s = retry_s
        self._clock = clock
        self._emojis = EMPTY_EMOJIS
        self._next_refresh_at: float | None = None  # None = never fetched
        self._task: asyncio.Task[EmojiSet] | None = None

    @property
    def is_stale(self) -> bool:
        return self._next_refresh_at is None or self._clock() >= self._next_refresh_at

    def current(self) -> EmojiSet:
        if self.is_stale:
            self._start_refresh()
        return self._emojis

    def _start_refresh(self) -> None:
        if self._task is not None and not self._task.done():
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return  # sync caller (CLI, plain unit test) — serve what we have
        self._task = loop.create_task(self.refresh())

    async def refresh(self) -> EmojiSet:
        try:
            remote = await self._fetch()
        except DiscordApiError as exc:
            logger.warning(
                "Discord emoji refresh refused (status=%s code=%s); keeping %d cached emoji(s)",
                exc.status, exc.code, len(self._emojis.by_logical),
            )
            return self._retry_later()
        except (httpx.HTTPError, TimeoutError) as exc:
            logger.warning(
                "Discord emoji refresh got no answer (%s); keeping %d cached emoji(s)",
                type(exc).__name__, len(self._emojis.by_logical),
            )
            return self._retry_later()
        except Exception:
            # A bug, not Discord: log loudly, but a background task must not
            # die — the cached set (or the text fallbacks) keeps rendering.
            logger.exception("Discord emoji refresh crashed; keeping the cached emojis")
            return self._retry_later()

        emojis = resolve_emoji_set(remote, self._expected)
        missing = missing_expected(emojis, self._expected)
        self._emojis = emojis
        if missing:
            logger.info(
                "Discord emojis: %d of %d current icons not uploaded yet (e.g. %s); rechecking in %ds",
                len(missing), len(self._expected), missing[0], int(self._retry_s),
            )
            self._next_refresh_at = self._clock() + self._retry_s
        else:
            self._next_refresh_at = self._clock() + self._ttl_s
        return emojis

    def _retry_later(self) -> EmojiSet:
        self._next_refresh_at = self._clock() + self._retry_s
        return self._emojis
