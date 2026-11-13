"""Conformance test: only a shell renders ``<main>``; pages never do.

A document gets one visible ``main`` landmark, and it may not sit inside
another landmark. The shells (``AppShell`` / ``GuestShell`` from
``@platform/ui``, and the few app-owned frames listed below) already wrap every
page in a ``<main>``. A page that renders its own ``<main>`` as its root nests
one main inside another: invalid HTML, and screen readers announce two main
landmarks. Pages use a ``<div>`` root (same classes) instead.

The only files that may render ``<main>`` are those in ``ALLOWED_MAIN_OWNERS``,
each a shell or a page that renders outside every shell. A new entry needs a
one-line reason saying why nothing wraps it in another ``<main>``. A page with
no shell gets its one ``<main>`` from ``StandaloneLayout`` (a layout route) or
``StandaloneMain`` from ``@platform/ui`` rather than a new entry here.

This test only stops a second ``<main>``; it can't see a page with none. The
mocked Playwright suites check that at runtime: the crash guard
(``@platform/ui/test-support/crashGuard``) fails a passing test whose page
doesn't end with exactly one main landmark.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[3]
_MAIN_ELEMENT = re.compile(r"<main(?=[\s/>])")
_SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx"}
_TEST_SUFFIXES = (".test.", ".spec.")

ALLOWED_MAIN_OWNERS: dict[str, str] = {
    "packages/shared-frontend/src/components/layout/AppShell.tsx":
        "The shared signed-in shell; its <main> is the page's one main landmark.",
    "packages/shared-frontend/src/components/layout/GuestShell.tsx":
        "The shared signed-out shell; its <main> is the page's one main landmark.",
    "packages/shared-frontend/src/components/layout/StandaloneMain.tsx":
        "The frame of every page and screen shown with no shell (StandaloneLayout routes, crash fallbacks).",
    "apps/mybookkeeper/frontend/src/app/components/Layout.tsx":
        "MBK's own signed-in shell (MBK does not use AppShell).",
    "apps/mybookkeeper/frontend/src/admin/components/AdminLayout.tsx":
        "MBK's /admin shell, a sibling route of Layout, not nested in it.",
    "apps/mybookkeeper/frontend/src/admin/components/AdminSkeleton.tsx":
        "Full-page /admin skeleton: the Suspense fallback shown in place of AdminLayout.",
    "apps/mybookkeeper/frontend/src/shared/components/RequireOrgSkeleton.tsx":
        "Full-page skeleton RequireOrg shows in place of Layout, before the shell mounts.",
    "apps/mygamingassistant/frontend/src/components/discord/DiscordActivityShell.tsx":
        "The Discord Activity frame, used in place of AppShell / GuestShell.",
    "apps/mypizzatracker/frontend/src/features/public-order/PageShell.tsx":
        "Frame of the public /order page, routed outside RootLayout (no shell).",
    "apps/mypizzatracker/frontend/src/pages/PublicOrderStatus.tsx":
        "Public /order/status page, routed outside RootLayout (no shell).",
}


def _is_test_file(path: Path, src: Path) -> bool:
    relative = path.relative_to(src)
    return "__tests__" in relative.parts or any(m in path.name for m in _TEST_SUFFIXES)


def strip_comments(text: str) -> str:
    """``text`` with its ``//`` and ``/* */`` comments removed; string and template literals kept.

    A comment opens only in code, so ``glob("./data/*.json")`` or ``"https://x"`` never starts one.
    A ``'`` or ``"`` string ends at its newline at the latest, so an apostrophe in JSX text
    (``Don't``) affects only its own line; template literals span lines, and code inside their
    ``${}`` is scanned as code. Any slip keeps comment text rather than hiding code, so it can
    only over-report a ``<main>``, never miss one.
    """
    out: list[str] = []
    template_depths: list[int] = []  # brace depth to return to for each open template ``${``
    mode = "code"
    depth = 0
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        pair = text[i : i + 2]
        if mode == "code":
            if pair == "//" and (i == 0 or text[i - 1] != ":"):
                end = text.find("\n", i)
                i = n if end == -1 else end
                continue
            if pair == "/*":
                end = text.find("*/", i + 2)
                i = n if end == -1 else end + 2
                continue
            if c in "'\"":
                mode = c
            elif c == "`":
                mode = "`"
            elif c == "{":
                depth += 1
            elif c == "}":
                if depth == 0 and template_depths:
                    depth = template_depths.pop()
                    mode = "`"
                else:
                    depth = max(0, depth - 1)
        elif c == "\\":
            out.append(text[i : i + 2])
            i += 2
            continue
        elif mode == "`":
            if pair == "${":
                template_depths.append(depth)
                depth = 0
                mode = "code"
                out.append(pair)
                i += 2
                continue
            if c == "`":
                mode = "code"
        elif c == mode or c == "\n":
            mode = "code"
        out.append(c)
        i += 1
    return "".join(out)


def renders_main(text: str) -> bool:
    """True if the source renders a ``<main>`` element (not a mention in a comment)."""
    return _MAIN_ELEMENT.search(strip_comments(text)) is not None


def main_owners(src: Path) -> list[Path]:
    """Non-test sources under ``src`` that render a ``<main>`` element."""
    return sorted(
        path
        for path in src.rglob("*")
        if path.is_file()
        and path.suffix in _SOURCE_SUFFIXES
        and not _is_test_file(path, src)
        and renders_main(path.read_text(encoding="utf-8"))
    )


def _frontend_sources() -> list[Path]:
    apps = sorted((_REPO_ROOT / "apps").glob("*/frontend/src"))
    return [
        *apps,
        _REPO_ROOT / "infra" / "templates" / "scaffold" / "frontend" / "src",
        _REPO_ROOT / "packages" / "shared-frontend" / "src",
    ]


def _source_id(src: Path) -> str:
    return src.relative_to(_REPO_ROOT).parts[1]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ('<main className="p-4">', True),
        ("<main>", True),
        ("<main\n  className=\"p-4\"\n>", True),
        ("<main ref={mainRef} className=\"flex-1\">{children}</main>", True),
        ('<div className="p-4">', False),
        ("<MainLayout />", False),
        ("<mainframe>", False),
        ("// pages render inside the shell's <main>", False),
        ("{/* scrolls inside AppShell's <main> */}", False),
        ("/* <main> */", False),
        ('const url = "https://example.com"; return <main className="p-4">x</main>;', True),
        ('glob("a/*.json"); <main/> {/* x */}', True),
        ("import.meta.glob('./data/*.json');\nreturn <main>{children}</main>; /* end */", True),
        ("const t = `a/*b ${x ? <main /> : null}`; // c */", True),
        ("<p>Don't</p>\n<main className=\"p-4\">", True),
        ("return (\n  <div>\n    {/* the shell owns the <main> landmark */}\n  </div>\n);", False),
        ("const x = 1; // pages render inside <main className=\"p-4\">", False),
        ("/**\n * Wraps the page in <main>.\n */\nexport default Frame;", False),
        ('const s = "/*"; <div />', False),
        ("", False),
    ],
)
def test_renders_main_detection(text: str, expected: bool) -> None:
    assert renders_main(text) is expected


def test_main_owners_ignores_test_files(tmp_path: Path) -> None:
    (tmp_path / "__tests__").mkdir()
    (tmp_path / "__tests__" / "a.tsx").write_text("<main />")
    (tmp_path / "b.test.tsx").write_text("<main />")
    (tmp_path / "c.spec.ts").write_text("<main />")
    (tmp_path / "Page.tsx").write_text("<main />")
    assert main_owners(tmp_path) == [tmp_path / "Page.tsx"]


def test_discovers_every_frontend() -> None:
    sources = _frontend_sources()
    assert len(sources) >= 8, f"expected the app frontends, the scaffold and shared-frontend, found {sources}"
    assert all(src.is_dir() for src in sources)


@pytest.mark.parametrize("path", sorted(ALLOWED_MAIN_OWNERS))
def test_allowlist_entries_still_render_main(path: str) -> None:
    file = _REPO_ROOT / path
    assert file.is_file(), f"{path} is in ALLOWED_MAIN_OWNERS but no longer exists. Remove the entry."
    assert renders_main(file.read_text(encoding="utf-8")), (
        f"{path} is in ALLOWED_MAIN_OWNERS but no longer renders <main>. Remove the entry."
    )
    assert ALLOWED_MAIN_OWNERS[path].strip(), f"{path} needs a one-line reason in ALLOWED_MAIN_OWNERS."


@pytest.mark.parametrize("src", _frontend_sources(), ids=_source_id)
def test_only_shells_render_main(src: Path) -> None:
    unexpected = [
        path.relative_to(_REPO_ROOT).as_posix()
        for path in main_owners(src)
        if path.relative_to(_REPO_ROOT).as_posix() not in ALLOWED_MAIN_OWNERS
    ]
    assert not unexpected, (
        f"{src.relative_to(_REPO_ROOT)}: these files render <main>, but the shell (AppShell / GuestShell or "
        f"the app's own layout) already wraps every page in one, so the page ends up with a <main> nested "
        f"in a <main>: invalid HTML and two main landmarks for screen readers. Found: {unexpected}. Fix: "
        f"change the page's root <main> to a <div> with the same classes. If the file really renders outside "
        f"every shell (a public page routed outside RootLayout, or a shell itself), add it to "
        f"ALLOWED_MAIN_OWNERS in {Path(__file__).name} with a one-line reason."
    )
