"""Minimal reader for a mysqldump file: column names + INSERT row tuples.

Only what the World Map generator needs from the cmangos classic-db dump —
``CREATE TABLE`` column order and the extended ``INSERT INTO ... VALUES
(...),(...);`` rows of a chosen set of tables. Values come back as Python
``str`` / ``int`` / ``float`` / ``None``. This is our own parser (no cmangos
code is used); it handles MySQL string escapes (``\\'``, ``\\\\``, ``''``,
``\\n``) and ``NULL``.
"""
from __future__ import annotations

import gzip
import re
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Union

SqlValue = Union[str, int, float, None]

_CREATE_RE = re.compile(r"^CREATE TABLE `(\w+)`")
_COLUMN_RE = re.compile(r"^\s*`(\w+)`\s")
_INSERT_RE = re.compile(r"^INSERT INTO `(\w+)`(?: \([^)]*\))? VALUES ")

_ESCAPES = {"n": "\n", "r": "\r", "t": "\t", "0": "\0", "Z": "\x1a"}


def _convert(token: str) -> SqlValue:
    if token == "NULL":
        return None
    try:
        return int(token)
    except ValueError:
        return float(token)


def parse_values(text: str) -> Iterator[list[SqlValue]]:
    """Yield each ``(...)`` tuple of a VALUES list (text after ``VALUES ``)."""
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch != "(":
            i += 1
            continue
        i += 1
        row: list[SqlValue] = []
        while i < n:
            ch = text[i]
            if ch == "'":
                i += 1
                buf: list[str] = []
                while i < n:
                    c = text[i]
                    if c == "\\" and i + 1 < n:
                        nxt = text[i + 1]
                        buf.append(_ESCAPES.get(nxt, nxt))
                        i += 2
                        continue
                    if c == "'":
                        if i + 1 < n and text[i + 1] == "'":
                            buf.append("'")
                            i += 2
                            continue
                        i += 1
                        break
                    buf.append(c)
                    i += 1
                row.append("".join(buf))
            elif ch in ",":
                i += 1
            elif ch == ")":
                i += 1
                break
            elif ch.isspace():
                i += 1
            else:
                start = i
                while i < n and text[i] not in ",)":
                    i += 1
                row.append(_convert(text[start:i].strip()))
        yield row


def read_tables(
    lines: Iterable[str], wanted: set[str]
) -> dict[str, list[dict[str, SqlValue]]]:
    """Read the rows of ``wanted`` tables as dicts keyed by column name."""
    columns: dict[str, list[str]] = {}
    rows: dict[str, list[dict[str, SqlValue]]] = {name: [] for name in wanted}
    current: str | None = None
    for line in lines:
        if current is not None:
            if line.startswith(")"):
                current = None
                continue
            m = _COLUMN_RE.match(line)
            if m:
                columns[current].append(m.group(1))
            continue
        m = _CREATE_RE.match(line)
        if m:
            if m.group(1) in wanted:
                current = m.group(1)
                columns[current] = []
            continue
        m = _INSERT_RE.match(line)
        if m and m.group(1) in wanted:
            table = m.group(1)
            cols = columns[table]
            for values in parse_values(line[m.end():]):
                if len(values) != len(cols):
                    raise ValueError(
                        f"{table}: row has {len(values)} values, expected {len(cols)}"
                    )
                rows[table].append(dict(zip(cols, values)))
    return rows


def read_dump(path: Path, wanted: set[str]) -> dict[str, list[dict[str, SqlValue]]]:
    """Read ``wanted`` tables from a ``.sql.gz`` dump."""
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as fh:
        return read_tables(fh, wanted)
