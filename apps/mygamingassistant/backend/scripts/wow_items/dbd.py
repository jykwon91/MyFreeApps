"""Decode one table record from WoWDBDefs' definition of its layout.

A ``.dbd`` file (https://github.com/wowdev/WoWDBDefs, MIT) lists a table's
column types, then one block per record layout: the builds it covers and its
fields in order, e.g. ``StatModifier_bonusStat<32>[10]`` (signed 32-bit, ten
of them) or ``$noninline,id$ID<32>`` (not stored in the record).

In the client's hotfix cache a record is those fields back to back, little
endian, with strings inline and NUL-terminated. Decoded rows use the same
column names and value text as wago.tools' CSV export (``Name_<i>`` for array
items), so the generators can treat both alike.
"""
from __future__ import annotations

import re
import struct
from dataclasses import dataclass

STRING_TYPES = frozenset({"string", "locstring"})
INT_FORMATS = {8: "b", 16: "h", 32: "i", 64: "q"}
FLOAT_SIZE = 4
FLOAT_DIGITS = 14

_COLUMN = re.compile(r"^(\w+)(?:<[^>]*>)?\s+(\w+)\??")
_FIELD = re.compile(r"^(?:\$([\w,]+)\$)?(\w+)(?:<(u?)(\d+)>)?(?:\[(\d+)\])?$")


class DbdError(ValueError):
    """The definition is missing the layout, or a record doesn't fit it."""


@dataclass(frozen=True)
class Field:
    name: str
    kind: str  # "int", "float" or "string"
    bits: int = 0
    unsigned: bool = False
    count: int = 1


@dataclass(frozen=True)
class Layout:
    hashes: tuple[str, ...]
    builds: tuple[str, ...]
    ranges: tuple[tuple[str, str], ...]
    fields: tuple[Field, ...]


def _version(build: str) -> tuple[int, ...]:
    return tuple(int(part) for part in build.split("."))


def _covers(layout: Layout, build: str) -> bool:
    """Whether a layout covers a build: a full version, or a bare build number."""
    if "." not in build:
        return any(b.rsplit(".", 1)[-1] == build for b in layout.builds)
    if build in layout.builds:
        return True
    version = _version(build)
    return any(_version(low) <= version <= _version(high) for low, high in layout.ranges)


def _parse_columns(lines: list[str]) -> dict[str, str]:
    types: dict[str, str] = {}
    for line in lines:
        match = _COLUMN.match(line.split("//", 1)[0].strip())
        if match:
            types[match.group(2)] = match.group(1)
    return types


def _parse_field(line: str, types: dict[str, str]) -> Field | None:
    match = _FIELD.match(line.split("//", 1)[0].strip())
    if match is None:
        raise DbdError(f"can't read field line {line!r}")
    annotations, name, unsigned, bits, count = match.groups()
    flags = set((annotations or "").split(","))
    if "noninline" in flags and "id" in flags:
        return None
    # A non-inline relation (SpellEffect.SpellID) isn't in the client file's record, but a hotfix
    # record carries it after the inline fields — where the definition lists it, last.
    if "noninline" in flags and "relation" not in flags:
        raise DbdError(f"non-inline field {name} other than the id or a relation isn't supported")
    column_type = types.get(name)
    if column_type is None:
        raise DbdError(f"field {name} has no column type")
    if column_type in STRING_TYPES:
        kind = "string"
    elif column_type == "float":
        kind = "float"
    elif bits:
        kind = "int"
    else:
        raise DbdError(f"int field {name} has no size")
    return Field(name, kind, int(bits or 0), unsigned == "u", int(count or 1))


def parse_dbd(text: str) -> list[Layout]:
    blocks = [block.strip().splitlines() for block in re.split(r"\n\s*\n", text.replace("\r\n", "\n"))]
    blocks = [block for block in blocks if block]
    if not blocks or blocks[0][0].strip() != "COLUMNS":
        raise DbdError("definition doesn't start with COLUMNS")
    types = _parse_columns(blocks[0][1:])
    layouts = []
    for block in blocks[1:]:
        hashes: list[str] = []
        builds: list[str] = []
        ranges: list[tuple[str, str]] = []
        fields: list[Field] = []
        for raw in block:
            line = raw.strip()
            if line.startswith("LAYOUT "):
                hashes += [h.strip().upper() for h in line[7:].split(",")]
            elif line.startswith("BUILD "):
                for part in (p.strip() for p in line[6:].split(",")):
                    if "-" in part:
                        low, high = part.split("-", 1)
                        ranges.append((low.strip(), high.strip()))
                    else:
                        builds.append(part)
            elif line.startswith("COMMENT"):
                continue
            else:
                field = _parse_field(line, types)
                if field is not None:
                    fields.append(field)
        layouts.append(Layout(tuple(hashes), tuple(builds), tuple(ranges), tuple(fields)))
    return layouts


def layout_for(layouts: list[Layout], build: str) -> Layout:
    """The layout covering a build (a full version or a bare build number)."""
    found = [layout for layout in layouts if _covers(layout, build)]
    if not found:
        raise DbdError(f"no layout covers build {build}")
    return found[0]


def _float_text(value: float) -> str:
    """A 32-bit float as wago.tools writes it: 14 significant digits (0.6 -> ``0.60000002384186``)."""
    return f"{value:.{FLOAT_DIGITS}g}"


def decode_record(layout: Layout, record_id: int, data: bytes, id_column: str = "ID") -> dict[str, str]:
    """One record as a CSV-style row. Fails unless the record is exactly the layout's size."""
    row = {id_column: str(record_id)}
    offset = 0
    try:
        for field in layout.fields:
            for i in range(field.count):
                key = field.name if field.count == 1 else f"{field.name}_{i}"
                if field.kind == "string":
                    end = data.index(b"\0", offset)
                    row[key] = data[offset:end].decode("utf-8")
                    offset = end + 1
                elif field.kind == "float":
                    row[key] = _float_text(struct.unpack_from("<f", data, offset)[0])
                    offset += FLOAT_SIZE
                else:
                    code = INT_FORMATS[field.bits]
                    row[key] = str(struct.unpack_from("<" + (code.upper() if field.unsigned else code), data, offset)[0])
                    offset += field.bits // 8
    except (ValueError, struct.error, UnicodeDecodeError) as exc:
        raise DbdError(f"record {record_id} doesn't fit the layout: {exc}") from exc
    if offset != len(data):
        raise DbdError(f"record {record_id} is {len(data)} bytes; the layout reads {offset}")
    return row
