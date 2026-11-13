"""Every no-backend (mocked) Playwright spec runs under the shared crash guard.

A mocked spec answers every API call itself, so a stub in the wrong shape can crash a page while
the test passes: an error boundary catches the crash and the rest of the app keeps rendering.
@platform/ui/test-support/crashGuard exports a `test` that fails on any crash, caught or not. A
spec that imports `test` from @playwright/test instead skips it, so this check fails on that. The
guard watches the test's own context; a spec that opens another one (browser.newContext) must hand
it to the `guardContext` fixture before opening a page in it, or that context's crashes go unseen,
and must not close it, because the guard closes it after the last reports arrive.

That check reads source text, not a syntax tree, so it follows a context only through a
`const|let|var <name> = await <anything>.newContext(...)` assignment in the same file. It can't
follow a context passed between files or reassigned, and it spots a browser's newPage only when the
browser's name contains "browser" (`browser`, `browser()!`, `otherBrowser`).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[3]
_GUARD = "@platform/ui/test-support/crashGuard"
# e2e/mocked/ plus any sibling suite such as e2e/mocked-serve-only/.
_MOCKED_SPECS = sorted(_REPO_ROOT.glob("apps/*/frontend/e2e/mocked*/**/*.spec.ts"))
# A value import (not `import type`) from @playwright/test, with its braces' contents.
_PLAYWRIGHT_VALUE_IMPORT = re.compile(r'import\s+(?!type\b)\{([^}]*)\}\s*from\s*"@playwright/test"')
# A value namespace (`* as pw`) or default (`pw`, `pw, { ... }`) import from @playwright/test. Either
# reaches `test` without naming it, so a mocked spec may not use one.
_PLAYWRIGHT_NAMESPACE_OR_DEFAULT_IMPORT = re.compile(
    r'import\s+(?!type\b)(\*\s*as\s+[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*)'
    # After a default import, only its own `, { ... }` or `, * as ns`, so the match ends with this
    # import statement even in a file without semicolons.
    r'(?:\s*,\s*(?:\{[^}]*\}|\*\s*as\s+[A-Za-z_$][\w$]*))?'
    r'\s*from\s*"@playwright/test"'
)
_IDENT = r"[A-Za-z_$][\w$]*"
# Any newContext call, whatever holds the browser (`browser`, `browser()!`, `b`).
_NEW_CONTEXT_CALL = re.compile(r"\.\s*newContext\s*\(")
# A newContext call whose context is kept in a variable the check can follow.
_NEW_CONTEXT_ASSIGNMENT = re.compile(
    r"\b(?:const|let|var)\s+(" + _IDENT + r")\s*(?::[^=;]+)?=\s*await\s+[^;\n]*?\.\s*newContext\s*\("
)
# browser.newPage() opens a page in a context of its own, which the guard never sees.
_BROWSER_NEW_PAGE = re.compile(r"\b[\w$]*[Bb]rowser[\w$]*\s*(?:\(\s*\))?\s*!?\s*\.\s*newPage\s*\(")
# Closing a page's context: either the guarded fixture context or an extra one the guard closes.
_PAGE_CONTEXT_CLOSE = re.compile(r"\.\s*context\s*\(\s*\)\s*\.\s*close\s*\(")


def _first(pattern: str, source: str) -> int | None:
    match = re.search(pattern, source)
    return match.start() if match else None


def _extra_context_problems(source: str) -> list[str]:
    """What's wrong with how this spec opens and hands over its own contexts; empty when nothing is."""
    problems: list[str] = []
    names = _NEW_CONTEXT_ASSIGNMENT.findall(source)
    if len(_NEW_CONTEXT_CALL.findall(source)) > len(names):
        problems.append("a newContext() result isn't kept in a const/let, so it can't be checked")
    # The checks below find each name's first guardContext/newPage in the file, so a name
    # reused by a second test would hide that test's mistakes behind the first one's calls.
    for name in sorted({n for n in names if names.count(n) > 1}):
        problems.append(f"{name} holds more than one newContext(); give each context its own name")
    for name in dict.fromkeys(names):
        n = re.escape(name)
        guarded_at = _first(r"\bguardContext\s*\(\s*" + n + r"\s*\)", source)
        first_page_at = _first(r"\b" + n + r"\s*\.\s*newPage\s*\(", source)
        if guarded_at is None:
            problems.append(f"{name} is never passed to guardContext()")
        elif first_page_at is not None and first_page_at < guarded_at:
            problems.append(f"{name}.newPage() runs before guardContext({name})")
        if re.search(r"\b" + n + r"\s*\.\s*close\s*\(", source):
            problems.append(f"{name}.close() closes it before the guard's reports settle")
    if _BROWSER_NEW_PAGE.search(source):
        problems.append("browser.newPage() opens an unguarded context; use newContext() + guardContext()")
    if _PAGE_CONTEXT_CLOSE.search(source):
        problems.append("page.context().close() closes a guarded context before its reports settle")
    return problems


_GUARD_IMPORT = re.compile(r'import\s+\{[^}]*\btest\b[^}]*\}\s*from\s*"' + re.escape(_GUARD) + '"')


def _playwright_value_names(source: str) -> list[str]:
    names: list[str] = []
    for match in _PLAYWRIGHT_VALUE_IMPORT.finditer(source):
        for part in match.group(1).split(","):
            name = part.strip()
            if name and not name.startswith("type "):
                names.append(name.split(" as ")[0].strip())
    return names


def _playwright_namespace_or_default(source: str) -> list[str]:
    return [match.group(1) for match in _PLAYWRIGHT_NAMESPACE_OR_DEFAULT_IMPORT.finditer(source)]


def _spec_id(path: Path) -> str:
    return str(path.relative_to(_REPO_ROOT))


@pytest.mark.parametrize(
    ("source", "names"),
    [
        ('import { test, expect, type Page } from "@playwright/test";', ["test", "expect"]),
        ('import type { Page } from "@playwright/test";', []),
        ('import { devices, type Page } from "@playwright/test";', ["devices"]),
        ('import { test as base } from "@playwright/test";', ["test"]),
    ],
)
def test_value_imports_from_playwright_are_recognised(source: str, names: list[str]) -> None:
    assert _playwright_value_names(source) == names


@pytest.mark.parametrize(
    ("source", "imports"),
    [
        ('import * as pw from "@playwright/test";', ["* as pw"]),
        ('import pw from "@playwright/test";', ["pw"]),
        ('import pw, { type Page } from "@playwright/test";', ["pw"]),
        ('import type * as pw from "@playwright/test";', []),
        ('import type pw from "@playwright/test";', []),
        ('import { devices, type Page } from "@playwright/test";', []),
        ('import type { Page } from "@playwright/test";', []),
        ('import pw, * as all from "@playwright/test"', ["pw"]),
        # No semicolons: a default-plus-named import of another module must not run on to a later
        # import from @playwright/test.
        ('import React, { useState } from "react"\nimport { devices } from "@playwright/test"\n', []),
        ('import React from "react"\nimport type { Page } from "@playwright/test"\n', []),
    ],
)
def test_namespace_and_default_imports_from_playwright_are_recognised(source: str, imports: list[str]) -> None:
    assert _playwright_namespace_or_default(source) == imports


@pytest.mark.parametrize(
    ("source", "problems"),
    [
        ("const c = await browser.newContext({ viewport });\nawait guardContext(c);\nconst p = await c.newPage();", []),
        ("const c = await browser()!.newContext();\nawait guardContext(c);", []),
        ("const c: BrowserContext = await other.newContext();\nawait guardContext( c );", []),
        ("async ({ browser, guardContext }) => { await freshPage(browser, guardContext); }", []),
        ("const p = await page.context().newPage();", []),
        ("const c = await browser.newContext();\nconst p = await c.newPage();", ["c is never passed to guardContext()"]),
        (
            "const c = await browser.newContext();\nconst p = await c.newPage();\nawait guardContext(c);",
            ["c.newPage() runs before guardContext(c)"],
        ),
        (
            "const c = await browser.newContext();\nawait guardContext(c);\nawait c.close();",
            ["c.close() closes it before the guard's reports settle"],
        ),
        (
            "await guardContext(await browser.newContext());",
            ["a newContext() result isn't kept in a const/let, so it can't be checked"],
        ),
        ("const p = await browser.newPage();", ["browser.newPage() opens an unguarded context; use newContext() + guardContext()"]),
        ("const p = await browser()!.newPage();", ["browser.newPage() opens an unguarded context; use newContext() + guardContext()"]),
        ("await friend.context().close();", ["page.context().close() closes a guarded context before its reports settle"]),
        ("await discord.close();", []),
        (
            "const c = await browser.newContext();\nawait guardContext(c);\n"
            "const c = await browser.newContext();\nconst p = await c.newPage();",
            ["c holds more than one newContext(); give each context its own name"],
        ),
    ],
)
def test_extra_context_problems_are_recognised(source: str, problems: list[str]) -> None:
    assert _extra_context_problems(source) == problems


def test_there_are_mocked_specs_to_check() -> None:
    assert _MOCKED_SPECS, "No apps/*/frontend/e2e/mocked*/*.spec.ts found, so the check below would pass on nothing."


def test_serve_only_mocked_specs_are_checked() -> None:
    assert any("/e2e/mocked-serve-only/" in spec.as_posix() for spec in _MOCKED_SPECS), (
        "No e2e/mocked-serve-only/ spec is in the checked set; the glob no longer reaches sibling mocked suites."
    )


@pytest.mark.parametrize("spec", _MOCKED_SPECS, ids=_spec_id)
def test_mocked_spec_uses_the_crash_guard(spec: Path) -> None:
    source = spec.read_text(encoding="utf-8")
    unguarded = [name for name in _playwright_value_names(source) if name in ("test", "expect")]
    assert not unguarded, (
        f"{_spec_id(spec)} imports {unguarded} from @playwright/test. Import test and expect from "
        f'"{_GUARD}" so the spec fails when the page crashes; keep only types and helpers such as '
        "devices from @playwright/test."
    )
    whole_module = _playwright_namespace_or_default(source)
    assert not whole_module, (
        f"{_spec_id(spec)} imports @playwright/test as {whole_module}, which reaches its unguarded test. "
        f'Import test and expect from "{_GUARD}" and only named types or helpers from @playwright/test.'
    )
    assert _GUARD_IMPORT.search(source), f'{_spec_id(spec)} doesn\'t import test from "{_GUARD}".'


@pytest.mark.parametrize("spec", _MOCKED_SPECS, ids=_spec_id)
def test_mocked_spec_guards_every_context_it_opens(spec: Path) -> None:
    problems = _extra_context_problems(spec.read_text(encoding="utf-8"))
    assert not problems, (
        f"{_spec_id(spec)}: {'; '.join(problems)}. Keep each extra context in a const, call "
        "`await guardContext(context)` (a crashGuard fixture) before opening a page in it, and leave "
        "closing it to the guard, so crashes in it fail the test."
    )
