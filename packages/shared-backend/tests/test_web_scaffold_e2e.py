"""The web scaffold gives every new app a working no-backend Playwright suite.

new_app copies infra/templates/scaffold/. Its package.json once ran
`playwright test --config e2e/playwright.config.ts` with no such file, so every new app started with
a broken script and no browser tests. These checks keep the mocked suite in the template, keep the
CI job that runs it in a generated app, keep a new app's ports off existing apps' ports, and catch
the bug class anywhere: a package.json script naming a config file that isn't there.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import pytest

from platform_shared.infra import new_app
from platform_shared.infra.new_app import ScaffoldError
from platform_shared.infra.used_ports import (
    VITE_DEFAULT_PORT,
    UsedPortsError,
    full_stack_ports,
    mocked_ports,
    ports_in_use,
    vite_dev_port,
)
from tests.workflow_steps import cannot_fail, steps_running

_REPO_ROOT = Path(__file__).resolve().parents[3]
_SCAFFOLD_FRONTEND = _REPO_ROOT / "infra" / "templates" / "scaffold" / "frontend"
_MOCKED_CONFIG = "playwright.layout.config.ts"
_CI_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "ci-shared-frontend.yml"
_CI_JOB = "web-scaffold"
_CI_COMMANDS = (
    'npm run typecheck:e2e --workspace="$SLUG-frontend"',
    "npx playwright test --config=playwright.layout.config.ts",
)
# A tsconfig*.json or *.config.{js,ts,mjs,cjs,mts,cts} named in a script, with any directory before it.
_CONFIG_FILE = re.compile(r"(?:^|/)(?:tsconfig[\w.-]*\.json|[\w.-]*\.config\.[cm]?[jt]s)$")
_PORTS = {"api_port": 18999, "caddy_host_port": 18998, "frontend_port": 15999}


def _manifests() -> list[Path]:
    """Every tracked package.json, so an untracked local folder can't fail the check."""
    listed = subprocess.run(
        ["git", "ls-files", "--", "package.json", "*/package.json"],
        cwd=_REPO_ROOT, check=True, capture_output=True, text=True,
    ).stdout.splitlines()
    return sorted(_REPO_ROOT / path for path in listed if "node_modules/" not in path)


_MANIFESTS = _manifests()


def _config_files(script: str) -> list[str]:
    """Every config file a script names, as written (relative to its package)."""
    found: list[str] = []
    for token in script.split():
        value = token.lstrip("(").rstrip(";)")
        if value.startswith("-") and "=" in value:
            value = value.split("=", 1)[1]
        value = value.strip("'\"")
        if _CONFIG_FILE.search(value):
            found.append(value)
    return found


def _manifest_id(path: Path) -> str:
    return path.relative_to(_REPO_ROOT).parent.as_posix() or "."


@pytest.mark.parametrize(
    ("script", "files"),
    [
        ("playwright test --config e2e/playwright.config.ts", ["e2e/playwright.config.ts"]),
        ("playwright test --config=playwright.layout.config.ts", ["playwright.layout.config.ts"]),
        ("playwright test -c=playwright.layout.config.ts", ["playwright.layout.config.ts"]),
        ("tsc -p tsconfig.e2e.json", ["tsconfig.e2e.json"]),
        ("tsc -p tsconfig.e2e.json; vitest run", ["tsconfig.e2e.json"]),
        ("(cd e2e && tsc -p tsconfig.json)", ["tsconfig.json"]),
        ("tsc -b . tsconfig.node.json && vite build", ["tsconfig.node.json"]),
        ("vite build --config 'vite.updater.config.ts'", ["vite.updater.config.ts"]),
        ("tsc --noEmit", []),
        ("vitest run", []),
    ],
)
def test_config_files_named_in_a_script_are_found(script: str, files: list[str]) -> None:
    assert _config_files(script) == files


def test_every_kind_of_package_is_checked() -> None:
    checked = {_manifest_id(path) for path in _MANIFESTS}
    for package in (
        ".",
        "infra/templates/scaffold/frontend",
        "sites/landing",
        "apps/mybookkeeper/api-client",
        "apps/mygamingassistant/desktop",
    ):
        assert package in checked, f"{package}/package.json isn't in the checked set."


def test_template_has_the_mocked_playwright_config() -> None:
    config = _SCAFFOLD_FRONTEND / _MOCKED_CONFIG
    assert config.is_file(), f"{config.relative_to(_REPO_ROOT)} is missing, so new apps get no mocked suite."
    source = config.read_text(encoding="utf-8")
    assert "@platform/ui/test-support/mockedPlaywrightConfig" in source, (
        f"{config.relative_to(_REPO_ROOT)} must build its config with the shared defineMockedConfig."
    )
    assert '"__FRONTEND_MOCKED_PORT__"' in source, (
        f"{config.relative_to(_REPO_ROOT)} must take its port from __FRONTEND_MOCKED_PORT__, which "
        "new_app derives from the app's dev port."
    )


def test_template_has_mocked_specs() -> None:
    specs = sorted((_SCAFFOLD_FRONTEND / "e2e" / "mocked").glob("*-mock.spec.ts"))
    assert specs, "infra/templates/scaffold/frontend/e2e/mocked/ has no *-mock.spec.ts, so new apps start untested."


@pytest.mark.parametrize("manifest", _MANIFESTS, ids=_manifest_id)
def test_every_config_a_script_names_exists(manifest: Path) -> None:
    scripts: dict[str, str] = json.loads(manifest.read_text(encoding="utf-8")).get("scripts", {})
    missing = [
        f"{name}: {path}"
        for name, script in scripts.items()
        for path in _config_files(script)
        if not (manifest.parent / path).is_file()
    ]
    assert not missing, (
        f"{_manifest_id(manifest)}/package.json has scripts naming config files that don't exist: "
        f"{missing}. Add the file or drop the script."
    )


@pytest.mark.parametrize("command", _CI_COMMANDS)
def test_ci_runs_the_scaffold_suite_in_a_step_that_can_fail(command: str) -> None:
    workflow = _CI_WORKFLOW.read_text(encoding="utf-8")
    steps = [
        (job, step) for job, step in steps_running(workflow, command) if job.get("name") == _CI_JOB
    ]
    assert steps, (
        f"{_CI_WORKFLOW.relative_to(_REPO_ROOT)} has no {_CI_JOB} job step running `{command}` on the "
        "generated app, so the scaffold's e2e suite can rot unseen."
    )
    assert any(not cannot_fail(job) and not cannot_fail(step) for job, step in steps), (
        f"{_CI_WORKFLOW.relative_to(_REPO_ROOT)} runs `{command}` only in a step that can't fail "
        "(continue-on-error: true, or an if: that is always false)."
    )


def test_mocked_port_is_the_dev_port_plus_the_offset(tmp_path: Path) -> None:
    template = tmp_path / "infra" / "templates" / "scaffold" / "frontend"
    template.mkdir(parents=True)
    (template / _MOCKED_CONFIG).write_text((_SCAFFOLD_FRONTEND / _MOCKED_CONFIG).read_text(encoding="utf-8"))

    new_app.scaffold_app(
        slug="portcheck", display_name="Port Check", repo_root=tmp_path,
        skip_render=True, skip_uv=True, skip_npm=True, **_PORTS,
    )

    generated = (tmp_path / "apps" / "portcheck" / "frontend" / _MOCKED_CONFIG).read_text(encoding="utf-8")
    assert f'port: "{15999 + new_app._MOCKED_PORT_OFFSET}"' in generated
    assert "beside one" in generated and "15999" in generated


def test_a_port_on_the_new_apps_own_mocked_port_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ScaffoldError, match="mocked-e2e"):
        new_app.scaffold_app(
            slug="portcheck", display_name="Port Check", repo_root=tmp_path,
            skip_render=True, skip_uv=True, skip_npm=True,
            **{**_PORTS, "api_port": 15999 + new_app._MOCKED_PORT_OFFSET},
        )


def _existing_app(root: Path, *, dev_port: int, mocked_port: int) -> None:
    frontend = root / "apps" / "otherapp" / "frontend"
    frontend.mkdir(parents=True)
    (root / "apps" / "otherapp" / "app.yaml").write_text("api_port: 8100\ncaddy_host_port: 8200\n")
    (frontend / "vite.config.ts").write_text(
        f'export default defineConfig({{\n  server: {{\n    port: {dev_port},\n'
        '    proxy: { "/api": { target: "http://localhost:8100" } },\n  },\n});\n'
    )
    (frontend / _MOCKED_CONFIG).write_text(f'export default defineMockedConfig({{ port: "{mocked_port}" }});\n')


@pytest.mark.parametrize(
    ("frontend_port", "clash"),
    [
        (15999, r"--frontend-port=15999 is already used by otherapp mocked e2e"),
        (15997, r"--frontend-port \+ 1 \(mocked e2e\)=15998 is already used by otherapp frontend dev server"),
    ],
    ids=["dev port on an existing mocked port", "mocked port on an existing dev port"],
)
def test_a_port_an_existing_app_uses_is_refused(tmp_path: Path, frontend_port: int, clash: str) -> None:
    _existing_app(tmp_path, dev_port=15998, mocked_port=15999)
    with pytest.raises(ScaffoldError, match=clash):
        new_app.scaffold_app(
            slug="portcheck", display_name="Port Check", repo_root=tmp_path,
            skip_render=True, skip_uv=True, skip_npm=True, **{**_PORTS, "frontend_port": frontend_port},
        )
    assert not (tmp_path / "apps" / "portcheck").exists()


def test_an_existing_apps_api_port_is_refused(tmp_path: Path) -> None:
    _existing_app(tmp_path, dev_port=15998, mocked_port=15999)
    with pytest.raises(ScaffoldError, match="--api-port=8100 is already used by otherapp api_port"):
        new_app.scaffold_app(
            slug="portcheck", display_name="Port Check", repo_root=tmp_path,
            skip_render=True, skip_uv=True, skip_npm=True, **{**_PORTS, "api_port": 8100},
        )


def test_the_real_repos_ports_are_all_found() -> None:
    used = ports_in_use(_REPO_ROOT)
    assert "mybookkeeper frontend dev server" in used[VITE_DEFAULT_PORT], "MBK's dev server sets no port: Vite's default."
    assert "mygamingassistant mocked e2e (playwright.layout.serve-only.config.ts)" in used[5185]
    assert "mygamingassistant full-stack e2e (playwright.serve-only.config.ts)" in used[5177], (
        "MGA's serve-only full-stack suite names its port through `const SERVE_ONLY_PORT = 5177;`."
    )


@pytest.mark.parametrize(
    ("source", "port"),
    [
        ("server: { port: 5178, proxy: { '/api': { target: 'x' } } }", 5178),
        ("server: { proxy: { '/api': { port: 9999 } }, port: 5180 }", 5180),
        ("server: { proxy: { '/api': { target: 'x' } } }", VITE_DEFAULT_PORT),
        ("export default defineConfig({ plugins: [] })", None),
    ],
)
def test_vite_dev_port_reads_only_the_server_blocks_own_port(source: str, port: int | None) -> None:
    assert vite_dev_port(source) == port


@pytest.mark.parametrize(
    "source",
    [
        "server: { port: DEV_PORT, proxy: {} }",
        "server: { port: Number(process.env.PORT) }",
        "server: { port, proxy: {} }",
    ],
)
def test_vite_dev_port_refuses_a_port_that_isnt_a_literal(source: str) -> None:
    with pytest.raises(UsedPortsError):
        vite_dev_port(source)


def test_mocked_ports_reads_quoted_ports() -> None:
    assert mocked_ports('defineMockedConfig({ port: "5185", suite: "x" })') == [5185]
    assert mocked_ports("defineMockedConfig({ port: '5186' })") == [5186]


@pytest.mark.parametrize("source", ["defineMockedConfig({ port: MOCKED_PORT })", "defineMockedConfig({ port })"])
def test_mocked_ports_refuses_a_port_that_isnt_a_quoted_literal(source: str) -> None:
    with pytest.raises(UsedPortsError):
        mocked_ports(source)


@pytest.mark.parametrize(
    ("source", "ports"),
    [
        ('baseURL: process.env.BASE_URL ?? "http://localhost:5176"', [5176]),
        ("const P = 5177;\nconst U = `http://localhost:${P}`;\ncommand: `npm run dev -- --port ${P}`", [5177, 5177]),
        ('command: "npm run dev -- --port 5190"', [5190]),
        ('testDir: "./"', []),
    ],
)
def test_full_stack_ports_resolves_literals_and_same_file_constants(source: str, ports: list[int]) -> None:
    assert full_stack_ports(source) == ports


@pytest.mark.parametrize(
    "source",
    [
        "const U = `http://localhost:${process.env.PORT}`;",
        "command: `npm run dev -- --port ${PORT}`",
        'url: "http://localhost:" + port',
    ],
)
def test_full_stack_ports_refuses_a_port_it_cant_resolve(source: str) -> None:
    with pytest.raises(UsedPortsError):
        full_stack_ports(source)


def test_an_unreadable_existing_port_stops_the_scaffold(tmp_path: Path) -> None:
    frontend = tmp_path / "apps" / "otherapp" / "frontend"
    frontend.mkdir(parents=True)
    (frontend / "vite.config.ts").write_text("export default defineConfig({ server: { port: DEV_PORT } });\n")
    with pytest.raises(ScaffoldError, match="Can't read the ports existing apps use: .*vite.config.ts"):
        new_app.scaffold_app(
            slug="portcheck", display_name="Port Check", repo_root=tmp_path,
            skip_render=True, skip_uv=True, skip_npm=True, **_PORTS,
        )
