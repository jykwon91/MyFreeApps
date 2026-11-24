"""scripts/agent/install-wow-addons.sh against a throwaway AddOns folder."""
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "agent" / "install-wow-addons.sh"


def run(addons: Path, *names: str) -> str:
    env = {**os.environ, "WOW_ADDONS": str(addons), "REF": "HEAD"}
    out = subprocess.run(["bash", str(SCRIPT), *names], cwd=ROOT, env=env, capture_output=True, text=True, check=True)
    return out.stdout


def test_first_install_writes_files_and_asks_for_a_restart(tmp_path: Path) -> None:
    out = run(tmp_path, "MGAProfessions")
    assert (tmp_path / "MGAProfessions" / "MGAProfessions.toc").is_file()
    assert "full game restart" in out


def test_second_install_changes_nothing(tmp_path: Path) -> None:
    run(tmp_path, "MGAProfessions")
    assert "already up to date" in run(tmp_path, "MGAProfessions")


def test_an_edited_file_is_restored_and_only_needs_a_reload(tmp_path: Path) -> None:
    run(tmp_path, "MGAProfessions")
    (tmp_path / "MGAProfessions" / "Core.lua").write_text("-- stale")
    out = run(tmp_path, "MGAProfessions")
    assert "updated MGAProfessions/Core.lua" in out
    assert "/reload" in out


def test_the_installed_prices_data_is_kept(tmp_path: Path) -> None:
    data = tmp_path / "MGAPrices" / "Data.lua"
    data.parent.mkdir()
    data.write_text("MGAPricesData = {live = true}")
    run(tmp_path, "MGAPrices")
    assert data.read_text() == "MGAPricesData = {live = true}"
    assert (tmp_path / "MGAPrices" / "MGAPrices.lua").is_file()


def test_shared_source_is_not_installed(tmp_path: Path) -> None:
    run(tmp_path)
    assert not (tmp_path / "shared").exists()
    assert (tmp_path / "MGALoot").is_dir()
