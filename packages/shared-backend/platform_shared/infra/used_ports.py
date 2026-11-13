"""The local ports existing apps already use, so a new app can't take one.

new_app reads these before scaffolding. A clash isn't only cosmetic: the mocked
Playwright config reuses a dev server already listening on its port outside CI,
so specs would run silently against another app.

Sources, per ``apps/<slug>/``:

- ``app.yaml``: ``api_port`` and ``caddy_host_port``.
- ``frontend/vite.config.ts``: ``server.port``, or Vite's default when the
  ``server`` block has no ``port`` key at all (MyBookkeeper).
- ``frontend/playwright.layout*.config.ts``: the ``port: "<n>"`` handed to
  ``defineMockedConfig``.
- ``frontend/e2e/playwright*.config.ts``: every ``localhost:<port>`` and
  ``--port <port>`` in the full-stack configs, where ``<port>`` may also be
  ``${NAME}`` for a ``const NAME = <n>;`` in the same file.

The parsing reads source text, so anything it can't resolve to an integer
literal raises :class:`UsedPortsError` rather than being skipped or guessed:
a port this module can't see is a port a new app could silently take.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from pathlib import Path

import yaml

# What Vite listens on when vite.config.ts's server block has no port key.
VITE_DEFAULT_PORT = 5173

_APP_YAML_PORT_KEYS: tuple[str, ...] = ("api_port", "caddy_host_port")
_IDENT = r"[A-Za-z_$][\w$]*"
_SERVER_BLOCK_START = re.compile(r"\bserver\s*:\s*\{")
_INNER_BLOCK = re.compile(r"\{[^{}]*\}")
# A `port` key, written out (`port: ...`) or as shorthand (`{ port, ...}`).
_PORT_KEY = re.compile(r"\bport\s*:|(?:^|[{,])\s*port\s*(?=[,}]|$)")
_PORT_VALUE = re.compile(r"\bport\s*:\s*([^,}\n]*)")
_INT_LITERAL = re.compile(r"\d+")
_QUOTED_INT = re.compile(r"""["'](\d+)["']""")
_CONST_INT = re.compile(r"\b(?:const|let|var)\s+(" + _IDENT + r")\s*=\s*(\d+)\s*;")
# Where a full-stack config names a port: after `localhost:` or `--port`.
_PORT_MENTION = re.compile(r"localhost:|--port\b")
_PORT_REFERENCE = re.compile(r"(?:localhost:|--port[ =])(?:(\d+)|\$\{\s*(" + _IDENT + r")\s*\})")


class UsedPortsError(ValueError):
    """Raised when a config names a port in a form this module can't resolve."""


def _block_after(source: str, start: int) -> str:
    """The text inside the brace that opens at ``start``, up to its matching close."""
    depth = 0
    for index in range(start, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[start + 1:index]
    return source[start + 1:]


def vite_dev_port(source: str) -> int | None:
    """The dev server port a vite.config.ts sets; Vite's default if its server block has no port key.

    Only the server block's own ``port`` counts, not one nested in, say, ``proxy`` or ``hmr``.
    None when there's no server block at all. Raises when the port isn't an integer literal.
    """
    match = _SERVER_BLOCK_START.search(source)
    if match is None:
        return None
    block = _block_after(source, match.end() - 1)
    while _INNER_BLOCK.search(block):
        block = _INNER_BLOCK.sub("", block)
    if not _PORT_KEY.search(block):
        return VITE_DEFAULT_PORT
    value = _PORT_VALUE.search(block)
    raw = value.group(1).strip() if value else "port (shorthand)"
    if not _INT_LITERAL.fullmatch(raw):
        raise UsedPortsError(f"server.port is {raw!r}, not an integer literal; write the number itself.")
    return int(raw)


def _vite_ports(source: str) -> list[int]:
    port = vite_dev_port(source)
    return [] if port is None else [port]


def mocked_ports(source: str) -> list[int]:
    """The ports a playwright.layout*.config.ts hands to defineMockedConfig, each a quoted literal."""
    if len(_PORT_KEY.findall(source)) != len(_PORT_VALUE.findall(source)):
        raise UsedPortsError('port is written as shorthand; write port: "<number>".')
    ports: list[int] = []
    for raw in _PORT_VALUE.findall(source):
        quoted = _QUOTED_INT.fullmatch(raw.strip())
        if quoted is None:
            raise UsedPortsError(f'port is {raw.strip()!r}, not a quoted integer literal like "5186".')
        ports.append(int(quoted.group(1)))
    return ports


def full_stack_ports(source: str) -> list[int]:
    """Every port an e2e/playwright*.config.ts names after ``localhost:`` or ``--port``."""
    constants = {name: int(value) for name, value in _CONST_INT.findall(source)}
    references = list(_PORT_REFERENCE.finditer(source))
    if len(references) != len(_PORT_MENTION.findall(source)):
        raise UsedPortsError(
            "a localhost:/--port names its port in a form other than a number or ${NAME}."
        )
    ports: list[int] = []
    for reference in references:
        literal, name = reference.groups()
        if literal is not None:
            ports.append(int(literal))
        elif name in constants:
            ports.append(constants[name])
        else:
            raise UsedPortsError(f"${{{name}}} isn't a `const {name} = <number>;` in the same file.")
    return ports


def _read_ports(path: Path, parse: Callable[[str], list[int]]) -> list[int]:
    """``parse`` applied to ``path``'s source, naming the file in any error."""
    try:
        return parse(path.read_text(encoding="utf-8"))
    except UsedPortsError as exc:
        raise UsedPortsError(f"{path}: {exc}") from exc


def ports_in_use(repo_root: Path) -> dict[int, list[str]]:
    """Every port an existing app uses, with who uses it (e.g. ``"mypizzatracker mocked e2e"``)."""
    used: dict[int, list[str]] = {}

    def add(port: int, owner: str) -> None:
        if owner not in used.setdefault(port, []):
            used[port].append(owner)

    for app_dir in sorted(path for path in (repo_root / "apps").glob("*") if path.is_dir()):
        app = app_dir.name
        frontend = app_dir / "frontend"
        app_yaml = app_dir / "app.yaml"
        if app_yaml.is_file():
            data = yaml.safe_load(app_yaml.read_text(encoding="utf-8")) or {}
            for key in _APP_YAML_PORT_KEYS:
                if isinstance(data.get(key), int):
                    add(data[key], f"{app} {key}")
        vite_config = frontend / "vite.config.ts"
        if vite_config.is_file():
            for port in _read_ports(vite_config, _vite_ports):
                add(port, f"{app} frontend dev server")
        for config in sorted(frontend.glob("playwright.layout*.config.ts")):
            for port in _read_ports(config, mocked_ports):
                add(port, f"{app} mocked e2e ({config.name})")
        for config in sorted((frontend / "e2e").glob("playwright*.config.ts")):
            for port in _read_ports(config, full_stack_ports):
                add(port, f"{app} full-stack e2e ({config.name})")
    return used
