"""platform_shared.infra.screen_map: web routes vs a mobile app's screen map."""
from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from platform_shared.infra.route_source import RouteSourceError, read_routes, strip_comments
from platform_shared.infra.screen_map import ScreenMapError, check_app, render_seed, web_routes

_REPO_ROOT = Path(__file__).resolve().parents[3]

_OBJECT_ROUTES = """
import type { RouteObject } from "react-router-dom";
export const routes: RouteObject[] = [
  { index: true, element: <Home /> },
  { path: "/recipes/:id", element: <RecipeDetail /> },
  { path: 'single-quoted', element: <Other /> },
  { path: ADMIN_ROUTES.DASHBOARD, element: <Admin /> },
  // { path: "/commented-out", element: <Gone /> },
  /* { path: "/block-commented", element: <Gone /> }, */
  { path: "*", element: <NotFound /> },
];
"""

_ROUTES = {"/", "/recipes/:id", "/single-quoted", "ADMIN_ROUTES.DASHBOARD"}


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _make_app(root: Path, *, mobile: object = True, routes: str = _OBJECT_ROUTES) -> None:
    flag = "" if mobile is None else f"mobile: {str(mobile).lower()}\n"
    _write(root / "apps/demo/app.yaml", f"app_slug: demo\n{flag}")
    _write(root / "apps/demo/frontend/src/routes.tsx", routes)


def _write_map(root: Path, body: str) -> None:
    _write(root / "apps/demo/mobile/screen-map.yaml", body)


def _complete_map() -> str:
    return render_seed(_ROUTES, "Not built yet.")


class TestStripComments:
    @pytest.mark.parametrize(
        "source",
        [
            '<Route path="/docs/*" element={<D />} />',
            "const glob = '/a/*';",
            'const url = "https://x/y";',
            "const t = `/a/* ${b} */`;",
            "<a>https://example.org</a>",
            "const r = /\\/*$/;",
            "<p>don't /x</p>",
        ],
    )
    def test_leaves_strings_and_non_comments_alone(self, source: str) -> None:
        assert strip_comments(source) == source

    @pytest.mark.parametrize(
        ("source", "expected"),
        [
            ("a // b", "a "),
            ("a /* b */ c", "a  c"),
            ("{/* <Route path='/x' /> */}", "{}"),
            ("a /* b\nc */ d", "a \n d"),
        ],
    )
    def test_removes_comments_and_keeps_line_numbers(self, source: str, expected: str) -> None:
        assert strip_comments(source) == expected


class TestReadRoutes:
    @pytest.mark.parametrize(
        ("source", "expected"),
        [
            ('<Route path="/docs/*" element={<D />} />\n<Route path="/after" />', {"/docs/*", "/after"}),
            ('<Route element={<Home />} index />', {"/"}),
            ('<Route index element={<Home />} />', {"/"}),
            ('<Route index={false} path="/a" />', {"/a"}),
            ('<Route path={"/braced"} />', {"/braced"}),
            ("<Route path={`/template`} />", {"/template"}),
            ("<Route path={ADMIN_ROUTES.DASHBOARD} />", {"ADMIN_ROUTES.DASHBOARD"}),
            ('<Route element={<Layout />}><Route path="/inner" /></Route>', {"/inner"}),
            ('<Route path="/a" element={<p>don\'t</p>} />\n<Route path="/b" />', {"/a", "/b"}),
            ('<Route path="/a" element={<X render={() => <Y z="}" />} />} />', {"/a"}),
            ('<Route path="*" element={<NotFound />} />\n<Route path="/a" />', {"/a"}),
            ('createBrowserRouter([{ path: "/plain", element: <A /> }]);', {"/plain"}),
            ('[{ index: true, element: <A /> }, { path: "/b", Component: B }]', {"/", "/b"}),
            ('[{ path: ROUTES.A, lazy: load }];', {"ROUTES.A"}),
            ('interface R { path: string; other: number }\nfunction f(path: Foo) {}', set()),
            ("// <Route path='/gone' />\n/* { path: '/gone2' } */", set()),
            ('import { Route } from "lucide-react";\n<Route className="x" />', set()),
            ('import { Route as Icon } from "lucide-react";\n<Route path="/a" />', {"/a"}),
            ("<Routes><Link to='/x' /></Routes>", set()),
        ],
    )
    def test_reads(self, source: str, expected: set[str]) -> None:
        assert read_routes(source) == (expected, [])

    @pytest.mark.parametrize(
        "source",
        [
            "<Route path={route.path} />",
            "<Route path={getPath()} />",
            "<Route path={a ? '/b' : '/c'} />",
            "<Route path />",
            "<Route element={<X />} />",
            'import { Route } from "./my-router";\n<Route element={<X />} />',
            "[{ path: route.path, element: <X /> }]",
            "[{ path: getPath(), element: <X /> }]",
            "[{ path: a ? '/b' : '/c', element: <X /> }]",
            "[{ path: '/a' + suffix, element: <X /> }]",
            "[{ path, element: <X /> }]",
        ],
    )
    def test_reports_what_it_cant_read(self, source: str) -> None:
        assert read_routes(source)[1]

    @pytest.mark.parametrize(
        "source",
        [
            "<Route {...props} />",
            '<Route path="/a',
            "<Route path={unbalanced />",
            "/* never closed\n<Route path='/a' />",
            "const t = `never closed\n<Route path='/a' />",
        ],
    )
    def test_raises_on_source_it_cant_scan(self, source: str) -> None:
        with pytest.raises(RouteSourceError):
            read_routes(source)


class TestWebRoutes:
    def test_no_frontend_has_no_routes(self, tmp_path: Path) -> None:
        assert web_routes(tmp_path, "demo") == set()

    def test_a_frontend_with_no_routes_fails(self, tmp_path: Path) -> None:
        _make_app(tmp_path, routes="export const x = 1;")
        with pytest.raises(ScreenMapError, match="no routes this check can read"):
            web_routes(tmp_path, "demo")

    def test_a_route_it_cant_read_fails_and_says_where(self, tmp_path: Path) -> None:
        _make_app(tmp_path, routes='<Route path="/a" />\n<Route path={route.path} />')
        with pytest.raises(ScreenMapError, match=r"src/routes.tsx: line 2: .*route\.path"):
            web_routes(tmp_path, "demo")

    def test_source_it_cant_scan_fails_and_says_where(self, tmp_path: Path) -> None:
        _make_app(tmp_path, routes='<Route path="/a" />\n/* never closed')
        with pytest.raises(ScreenMapError, match=r"src/routes.tsx: line 2: unterminated"):
            web_routes(tmp_path, "demo")

    def test_finds_a_router_with_no_route_type_or_tag(self, tmp_path: Path) -> None:
        _make_app(tmp_path, routes='createBrowserRouter([{ path: "/plain", element: <A /> }]);')
        assert web_routes(tmp_path, "demo") == {"/plain"}

    def test_finds_a_route_array_declared_apart_from_the_router(self, tmp_path: Path) -> None:
        _make_app(tmp_path, routes='export const routes = [{ path: "/a", Component: A }];')
        assert web_routes(tmp_path, "demo") == {"/a"}

    def test_reads_new_apps_from_the_web_scaffold(self, tmp_path: Path) -> None:
        shutil.copytree(
            _REPO_ROOT / "infra/templates/scaffold/frontend/src",
            tmp_path / "apps/demo/frontend/src",
        )
        assert web_routes(tmp_path, "demo")

    def test_reads_object_routes(self, tmp_path: Path) -> None:
        _make_app(tmp_path)
        assert web_routes(tmp_path, "demo") == _ROUTES

    def test_reads_jsx_routes_including_multiline_and_nested(self, tmp_path: Path) -> None:
        _make_app(
            tmp_path,
            routes="""
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={<Layout />}
              >
                <Route index element={<Dashboard />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
            """,
        )
        assert web_routes(tmp_path, "demo") == {"/", "/login", "/transactions"}

    def test_ignores_files_that_declare_no_routes(self, tmp_path: Path) -> None:
        _make_app(tmp_path)
        _write(
            tmp_path / "apps/demo/frontend/src/constants/nav.ts",
            'export const NAV = [{ path: "/not-a-route", label: "Nav" }];',
        )
        assert "/not-a-route" not in web_routes(tmp_path, "demo")

    def test_ignores_tests(self, tmp_path: Path) -> None:
        _make_app(tmp_path)
        for name in ("__tests__/App.tsx", "App.test.tsx", "App.spec.tsx", "test/helpers.tsx"):
            _write(
                tmp_path / "apps/demo/frontend/src" / name,
                '<Route path="/only-in-a-test" element={<X />} />',
            )
        assert "/only-in-a-test" not in web_routes(tmp_path, "demo")

    def test_finds_routes_in_any_file_that_declares_them(self, tmp_path: Path) -> None:
        _make_app(tmp_path)
        _write(
            tmp_path / "apps/demo/frontend/src/games/thing/routes.tsx",
            'const r: RouteObject[] = [{ path: "/thing", element: <Thing /> }];',
        )
        assert "/thing" in web_routes(tmp_path, "demo")

    def test_keeps_url_strings_when_stripping_comments(self, tmp_path: Path) -> None:
        _make_app(
            tmp_path,
            routes='const u = "http://x"; const r: RouteObject[] = [{ path: "/after-url" }];',
        )
        assert web_routes(tmp_path, "demo") == {"/after-url"}

    @pytest.mark.parametrize(
        ("app", "expected"),
        [
            ("mybookkeeper", {"/", "/login", "/transactions", "/leases/:leaseId", "/apply/:slug"}),
            ("myjobhunter", {"/", "/dashboard", "/login", "ADMIN_ROUTES.DASHBOARD"}),
            ("mygamingassistant", {"/", "/:gameSlug/:mapSlug", "/wow-forever/guide"}),
            ("mylanguagetutor", {"/", "/practice", "/onboarding/level"}),
            ("mypizzatracker", {"/", "/order/status/:orderId", "/financials"}),
            ("myrecipes", {"/", "/recipes/:id/versions/:vid/diff", "/discover"}),
        ],
    )
    def test_reads_each_real_app(self, app: str, expected: set[str]) -> None:
        """If an app's route syntax drifts, this fails rather than the check going quiet."""
        routes = web_routes(_REPO_ROOT, app)
        assert expected <= routes
        assert "/*" not in routes


class TestCheckApp:
    def test_no_op_without_the_flag(self, tmp_path: Path) -> None:
        _make_app(tmp_path, mobile=None)
        assert check_app(tmp_path, "demo") == []

    def test_no_op_with_the_flag_false(self, tmp_path: Path) -> None:
        _make_app(tmp_path, mobile=False)
        assert check_app(tmp_path, "demo") == []

    def test_rejects_a_flag_that_isnt_a_bool(self, tmp_path: Path) -> None:
        _write(tmp_path / "apps/demo/app.yaml", 'app_slug: demo\nmobile: "yes"\n')
        with pytest.raises(ValueError, match="mobile must be true/false"):
            check_app(tmp_path, "demo")

    def test_mobile_dir_without_the_flag_fails(self, tmp_path: Path) -> None:
        _make_app(tmp_path, mobile=None)
        _write_map(tmp_path, _complete_map())
        assert "must set `mobile: true`" in check_app(tmp_path, "demo")[0]

    def test_package_json_without_the_flag_fails(self, tmp_path: Path) -> None:
        _make_app(tmp_path, mobile=None)
        _write(tmp_path / "apps/demo/mobile/package.json", "{}")
        assert "must set `mobile: true`" in check_app(tmp_path, "demo")[0]

    def test_leftovers_from_another_branch_are_not_a_mobile_app(self, tmp_path: Path) -> None:
        _make_app(tmp_path, mobile=None)
        _write(tmp_path / "apps/demo/mobile/node_modules/expo-router/package.json", "{}")
        assert check_app(tmp_path, "demo") == []

    def test_flag_without_a_map_fails(self, tmp_path: Path) -> None:
        _make_app(tmp_path)
        assert "is missing" in check_app(tmp_path, "demo")[0]

    def test_complete_map_passes(self, tmp_path: Path) -> None:
        _make_app(tmp_path)
        _write_map(tmp_path, _complete_map())
        assert check_app(tmp_path, "demo") == []

    def test_new_web_route_with_no_entry_fails(self, tmp_path: Path) -> None:
        _make_app(tmp_path)
        _write_map(tmp_path, _complete_map())
        _write(
            tmp_path / "apps/demo/frontend/src/extra.tsx",
            'const r: RouteObject[] = [{ path: "/brand-new", element: <New /> }];',
        )
        errors = check_app(tmp_path, "demo")
        assert len(errors) == 1
        assert "'/brand-new' has no entry" in errors[0]

    def test_removed_web_route_fails(self, tmp_path: Path) -> None:
        _make_app(tmp_path)
        _write_map(tmp_path, render_seed(_ROUTES | {"/removed"}, "Not built yet."))
        errors = check_app(tmp_path, "demo")
        assert len(errors) == 1
        assert "'/removed' is no longer a web route" in errors[0]

    @pytest.mark.parametrize(
        "entry",
        [
            "{}",
            "{screen: index, not_on_mobile: both}",
            "{unknown: value}",
            "just-a-string",
            "{not_on_mobile: ''}",
            "{not_on_mobile: '   '}",
            "{screen: ''}",
        ],
    )
    def test_entry_needs_exactly_one_nonblank_decision(self, tmp_path: Path, entry: str) -> None:
        _make_app(tmp_path, routes='<Route path="/a" element={<A />} />')
        _write_map(tmp_path, f"routes:\n  /a: {entry}\n")
        errors = check_app(tmp_path, "demo")
        assert len(errors) == 1
        assert "'/a'" in errors[0]

    def test_screen_must_exist(self, tmp_path: Path) -> None:
        _make_app(tmp_path, routes='<Route path="/a" element={<A />} />')
        _write_map(tmp_path, "routes:\n  /a: {screen: a}\n")
        assert "has no file under app/" in check_app(tmp_path, "demo")[0]

    @pytest.mark.parametrize("file", ["recipes/[id].tsx", "recipes/[id]/index.tsx"])
    def test_screen_resolves_to_a_file_or_an_index(self, tmp_path: Path, file: str) -> None:
        _make_app(tmp_path, routes='<Route path="/recipes/:id" element={<A />} />')
        _write_map(tmp_path, "routes:\n  /recipes/:id: {screen: 'recipes/[id]'}\n")
        _write(tmp_path / "apps/demo/mobile/app" / file, "export default null;")
        assert check_app(tmp_path, "demo") == []

    def test_unreadable_routes_fail_the_check(self, tmp_path: Path) -> None:
        _make_app(tmp_path, routes="<Route path={route.path} />")
        _write_map(tmp_path, "routes: {}\n")
        assert "route.path" in check_app(tmp_path, "demo")[0]

    def test_a_frontend_with_no_routes_fails_the_check(self, tmp_path: Path) -> None:
        _make_app(tmp_path, routes="export const x = 1;")
        _write_map(tmp_path, "routes: {}\n")
        assert "no routes" in check_app(tmp_path, "demo")[0]

    @pytest.mark.parametrize("body", ["[]", "routes: []", "other: {}", "routes: {unclosed"])
    def test_malformed_map_fails(self, tmp_path: Path, body: str) -> None:
        _make_app(tmp_path)
        _write_map(tmp_path, body)
        assert check_app(tmp_path, "demo")

    def test_seed_is_valid_for_routes_needing_yaml_quoting(self, tmp_path: Path) -> None:
        _make_app(tmp_path, routes='<Route path="/:gameSlug/*" element={<A />} />')
        _write_map(tmp_path, render_seed(web_routes(tmp_path, "demo"), "Not built yet."))
        assert check_app(tmp_path, "demo") == []
