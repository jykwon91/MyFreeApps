"""Read React Router routes out of TypeScript and JSX source, without running it.

This is a scanner, not a parser: it runs in the required Python test job, which has no
Node or ``node_modules`` to run the TypeScript compiler with. So it only accepts what it
can read for certain, and reports anything else as a problem rather than skipping it.
"""

from __future__ import annotations

import re

ROUTE_FILE_MARKER = re.compile(
    r"<Route(?=[\s/>])"
    r"|\bRouteObject\b"
    r"|\b(?:createBrowserRouter|createHashRouter|createMemoryRouter|createRoutesFromElements|useRoutes)\b"
    r"|\b(?:element|Component|lazy)\s*:"
)

_ROUTE_TAG = re.compile(r"<Route(?=[\s/>])")
# Packages known to export something else called Route, like an icon. Only these are
# skipped: an unknown `Route` is read like a router's, and fails if it doesn't fit.
_NON_ROUTER_ROUTE_PACKAGES = frozenset({"lucide-react"})
_ROUTE_IMPORT = re.compile(r"""import\s*\{[^}]*\bRoute\b(?!\s+as\b)[^}]*\}\s*from\s*["']([^"']+)["']""")
_OBJECT_PATH = re.compile(r"(?<![\w.$])path\s*:\s*")
_OBJECT_SHORTHAND = re.compile(r"\{\s*path\s*,\s*(?:element|Component|lazy)\b")
_OBJECT_INDEX = re.compile(r"(?<![\w.$])index\s*:\s*true\b")
_ATTRIBUTE_NAME = re.compile(r"[A-Za-z_][\w-]*")
_IDENTIFIER_CHAIN = re.compile(r"[A-Za-z_$][\w.$]*")
_LITERAL = re.compile(r"""(?:"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`)""")
# A module-level constant, like ADMIN_ROUTES.DASHBOARD. `route.path` is a variable, which
# usually means routes built in a loop, and those can't be listed from source.
_CONSTANT = re.compile(r"[A-Z][\w$]*(?:\.[\w$]+)*")
_TYPE_NAMES = frozenset({"string", "any", "unknown", "never"})
# What follows `path: X` when X is a type (`path: string;`, `(path: Foo)`), not a value.
_AFTER_TYPE = frozenset(";)=|")
_AFTER_VALUE = frozenset(",}")
_CATCH_ALL = "*"


class RouteSourceError(ValueError):
    """Raised when source can't be scanned at all."""


def _line_of(source: str, offset: int) -> int:
    return source.count("\n", 0, offset) + 1


def _string_end(source: str, start: int) -> int | None:
    """Return the offset after the quote closing the one at ``start``, or None.

    Quoted strings can't span lines, so no closing quote on the line means this wasn't a
    string: it's an apostrophe in JSX text (`<p>don't</p>`) or part of a regex.
    """
    quote = source[start]
    i = start + 1
    while i < len(source) and source[i] != "\n":
        if source[i] == "\\":
            i += 2
        elif source[i] == quote:
            return i + 1
        else:
            i += 1
    return None


def _template_end(source: str, start: int) -> int:
    i = start + 1
    while i < len(source):
        if source[i] == "\\":
            i += 2
        elif source[i] == "`":
            return i + 1
        elif source.startswith("${", i):
            i = _braces_end(source, i + 1)
        else:
            i += 1
    raise RouteSourceError(f"line {_line_of(source, start)}: unterminated template literal.")


def _braces_end(source: str, start: int) -> int:
    """Return the offset after the brace closing the one at ``start``."""
    depth = 0
    i = start
    while i < len(source):
        char = source[i]
        if char == "\\":
            i += 2
            continue
        if char in "\"'":
            i = _string_end(source, i) or i + 1
            continue
        if char == "`":
            i = _template_end(source, i)
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise RouteSourceError(f"line {_line_of(source, start)}: unbalanced braces.")


def strip_comments(source: str) -> str:
    """Remove comments, leaving strings alone and every line number where it was."""
    kept: list[str] = []
    i = 0
    while i < len(source):
        char = source[i]
        if char == "\\":
            kept.append(source[i : i + 2])
            i += 2
        elif char in "\"'`":
            end = _template_end(source, i) if char == "`" else _string_end(source, i) or i + 1
            kept.append(source[i:end])
            i = end
        elif source.startswith("/*", i):
            end = source.find("*/", i + 2)
            if end == -1:
                raise RouteSourceError(f"line {_line_of(source, i)}: unterminated /* comment.")
            kept.append("\n" * source.count("\n", i, end))
            i = end + 2
        elif source.startswith("//", i) and (i == 0 or source[i - 1] != ":"):
            end = source.find("\n", i)
            i = len(source) if end == -1 else end
        else:
            kept.append(char)
            i += 1
    return "".join(kept)


def _read_route_tag(source: str, start: int) -> tuple[dict[str, str | None], bool]:
    """Return a `<Route ...>` tag's attributes and whether it closes itself."""
    attributes: dict[str, str | None] = {}
    i = start + len("<Route")
    while i < len(source):
        if source[i].isspace():
            i += 1
        elif source.startswith("/>", i):
            return attributes, True
        elif source[i] == ">":
            return attributes, False
        elif source[i] == "{":
            raise RouteSourceError(
                f"line {_line_of(source, start)}: <Route> spreads its props, so its path "
                f"can't be read. Write the path on the tag."
            )
        else:
            name = _ATTRIBUTE_NAME.match(source, i)
            if name is None:
                break
            i = name.end()
            if source[i:i + 1] != "=":
                attributes[name.group()] = None
            elif source[i + 1:i + 2] == "{":
                end = _braces_end(source, i + 1)
                attributes[name.group()] = source[i + 2 : end - 1].strip()
                i = end
            else:
                end = _string_end(source, i + 1)
                if end is None:
                    break
                attributes[name.group()] = source[i + 1 : end]
                i = end
    raise RouteSourceError(f"line {_line_of(source, start)}: can't read this <Route> tag.")


def _route_key(raw: str) -> str | None:
    """Return the route ``raw`` names, "" for a catch-all, or None if it can't be read."""
    literal = _LITERAL.fullmatch(raw)
    if literal:
        text = next(group for group in literal.groups() if group is not None).strip()
        return "" if text == _CATCH_ALL else "/" + text.lstrip("/")
    return raw if _CONSTANT.fullmatch(raw) else None


def _add_route(raw: str, offset: int, source: str, routes: set[str], problems: list[str]) -> None:
    key = _route_key(raw)
    if key is None:
        problems.append(
            f"line {_line_of(source, offset)}: can't read route path `{raw}`. "
            f"Use a string or a module-level constant."
        )
    elif key:
        routes.add(key)


def _scan_route_tags(source: str, routes: set[str], problems: list[str]) -> None:
    route_import = _ROUTE_IMPORT.search(source)
    if route_import and route_import.group(1) in _NON_ROUTER_ROUTE_PACKAGES:
        return
    for tag in _ROUTE_TAG.finditer(source):
        attributes, self_closing = _read_route_tag(source, tag.start())
        if attributes.get("path") is not None:
            _add_route(attributes["path"], tag.start(), source, routes, problems)
        if "index" in attributes and attributes["index"] != "false":
            routes.add("/")
        elif "path" not in attributes and self_closing:
            problems.append(
                f"line {_line_of(source, tag.start())}: <Route> has no path, no index and "
                f"no children, so it can't be listed."
            )
        elif "path" in attributes and attributes["path"] is None:
            problems.append(f"line {_line_of(source, tag.start())}: <Route path> has no value.")


def _scan_route_objects(source: str, routes: set[str], problems: list[str]) -> None:
    for match in _OBJECT_PATH.finditer(source):
        start = match.end()
        char = source[start:start + 1]
        if char == "`":
            end = _template_end(source, start)
        elif char in ('"', "'"):
            end = _string_end(source, start)
        else:
            chain = _IDENTIFIER_CHAIN.match(source, start)
            end = chain.end() if chain else None
        if end is None:
            problems.append(f"line {_line_of(source, start)}: can't read this route path.")
            continue

        raw = source[start:end]
        rest = source[end:].lstrip()
        following = rest[:1]
        if raw in _TYPE_NAMES or following in _AFTER_TYPE and following:
            continue
        if following and following not in _AFTER_VALUE:
            problems.append(
                f"line {_line_of(source, start)}: can't read a route path computed with "
                f"`{following}`. Use a string or a module-level constant."
            )
            continue
        _add_route(raw, start, source, routes, problems)

    for match in _OBJECT_SHORTHAND.finditer(source):
        problems.append(
            f"line {_line_of(source, match.start())}: can't read a route's `path` shorthand. "
            f"Use a string or a module-level constant."
        )
    if _OBJECT_INDEX.search(source):
        routes.add("/")


def read_routes(source: str) -> tuple[set[str], list[str]]:
    """Return the routes in one file, and anything in it that couldn't be read."""
    routes: set[str] = set()
    problems: list[str] = []
    code = strip_comments(source)
    _scan_route_tags(code, routes, problems)
    _scan_route_objects(code, routes, problems)
    return routes, problems
