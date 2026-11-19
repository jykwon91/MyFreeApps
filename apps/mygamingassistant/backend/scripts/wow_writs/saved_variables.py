"""Read an addon's SavedVariables file: the Lua the client writes on logout.

Data only, never run: the reader accepts the literals the client writes
(tables, strings, numbers, booleans, nil) and stops on anything else.
"""
from __future__ import annotations

import re
from typing import Any

_TOKEN = re.compile(
    r"""\s+|--[^\n]*|(?P<str>"(?:[^"\\]|\\.)*")|(?P<num>-?(?:0x[0-9a-fA-F]+|\d+(?:\.\d*)?(?:[eE][-+]?\d+)?|\.\d+))"""
    r"""|(?P<name>[A-Za-z_][A-Za-z0-9_]*)|(?P<sym>[{}\[\]=,;])""",
    re.S,
)
_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", '"': '"', "\\": "\\", "'": "'", "\n": "\n"}


class SavedVariablesError(ValueError):
    """The file isn't the plain data a SavedVariables file holds."""


def _unquote(text: str) -> str:
    out, i, body = [], 0, text[1:-1]
    while i < len(body):
        c = body[i]
        if c != "\\":
            out.append(c)
            i += 1
            continue
        nxt = body[i + 1]
        digits = re.match(r"\d{1,3}", body[i + 1:])
        if digits:
            out.append(chr(int(digits.group())))
            i += 1 + len(digits.group())
        elif nxt in _ESCAPES:
            out.append(_ESCAPES[nxt])
            i += 2
        else:
            raise SavedVariablesError(f"unknown string escape \\{nxt}")
    return "".join(out)


def _tokens(text: str) -> list[tuple[str, str]]:
    out, at = [], 0
    while at < len(text):
        m = _TOKEN.match(text, at)
        if not m:
            raise SavedVariablesError(f"unexpected text at {at}: {text[at:at + 20]!r}")
        at = m.end()
        if m.lastgroup:
            out.append((m.lastgroup, m.group(m.lastgroup)))
    return out


class _Parser:
    def __init__(self, tokens: list[tuple[str, str]]) -> None:
        self.tokens, self.at = tokens, 0

    def peek(self) -> tuple[str, str] | None:
        return self.tokens[self.at] if self.at < len(self.tokens) else None

    def take(self, value: str | None = None) -> tuple[str, str]:
        tok = self.peek()
        if tok is None or (value is not None and tok[1] != value):
            raise SavedVariablesError(f"expected {value or 'a value'}, found {tok[1] if tok else 'end of file'}")
        self.at += 1
        return tok

    def value(self) -> Any:
        kind, text = self.take()
        if kind == "str":
            return _unquote(text)
        if kind == "num":
            number = float.fromhex(text) if "x" in text.lower() else float(text)
            return int(number) if number.is_integer() and not re.search(r"[.eE]", text) else number
        if kind == "name" and text in ("true", "false", "nil"):
            return {"true": True, "false": False, "nil": None}[text]
        if text == "{":
            return self.table()
        raise SavedVariablesError(f"unexpected {text!r}")

    def table(self) -> Any:
        entries: dict[Any, Any] = {}
        position = 1
        while self.peek() and self.peek()[1] != "}":
            tok = self.peek()
            nxt = self.tokens[self.at + 1] if self.at + 1 < len(self.tokens) else None
            if tok[1] == "[":
                self.take("[")
                key = self.value()
                self.take("]")
                self.take("=")
                entries[key] = self.value()
            elif tok[0] == "name" and nxt and nxt[1] == "=":
                self.take()
                self.take("=")
                entries[tok[1]] = self.value()
            else:
                entries[position] = self.value()
                position += 1
            if self.peek() and self.peek()[1] in (",", ";"):
                self.take()
        self.take("}")
        if entries and list(entries) == list(range(1, len(entries) + 1)):
            return list(entries.values())
        return entries


def read_saved_variables(text: str) -> dict[str, Any]:
    """Every ``Name = value`` the file assigns."""
    parser = _Parser(_tokens(text))
    out: dict[str, Any] = {}
    while parser.peek():
        kind, name = parser.take()
        if kind != "name":
            raise SavedVariablesError(f"expected a variable name, found {name!r}")
        parser.take("=")
        out[name] = parser.value()
    return out
