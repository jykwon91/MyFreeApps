"""scripts/agent/pr-merge-on-green.sh against a fake `gh` that serves canned checks."""
import os
import stat
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "agent" / "pr-merge-on-green.sh"

FAKE_GH = """#!/usr/bin/env bash
case "$1 $2" in
  "repo view") echo owner/repo ;;
  "pr view") case "$*" in *baseRefName*) echo main ;; *) echo abc123 ;; esac ;;
  "api repos/owner/repo/branches/main/protection/required_status_checks"*)
    [ -f "$FAKE_DIR/no-protection" ] && exit 1
    cat "$FAKE_DIR/required" ;;
  "pr checks") cat "$FAKE_DIR/checks" ;;
  "pr merge") echo merged > "$FAKE_DIR/merged" ;;
esac
"""


def run(tmp_path: Path, checks: list[tuple[str, str]], required: list[str], *args: str, protected: bool = True) -> subprocess.CompletedProcess[str]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(exist_ok=True)
    gh = bin_dir / "gh"
    gh.write_text(FAKE_GH, newline="\n")
    gh.chmod(gh.stat().st_mode | stat.S_IEXEC)
    (tmp_path / "checks").write_text("".join(f"{b}\t{n}\n" for b, n in checks), newline="\n")
    (tmp_path / "required").write_text("".join(f"{r}\n" for r in required), newline="\n")
    if not protected:
        (tmp_path / "no-protection").write_text("")
    env = {**os.environ, "FAKE_DIR": str(tmp_path), "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}
    return subprocess.run(["bash", str(SCRIPT), "7", *args], cwd=ROOT, env=env, capture_output=True, text=True)


def test_merges_when_green_and_the_required_check_passed(tmp_path: Path) -> None:
    out = run(tmp_path, [("pass", "ci-gate"), ("pass", "build"), ("skipping", "e2e")], ["ci-gate"])
    assert out.returncode == 0, out.stderr
    assert (tmp_path / "merged").exists()


def test_a_skipped_required_check_counts_as_passed(tmp_path: Path) -> None:
    out = run(tmp_path, [("skipping", "ci-gate"), ("pass", "build")], ["ci-gate"])
    assert out.returncode == 0, out.stderr


def test_does_not_merge_when_the_required_check_never_reports(tmp_path: Path) -> None:
    out = run(tmp_path, [("pass", "build")], ["ci-gate"], "--timeout-min", "0")
    assert out.returncode == 2
    assert "ci-gate" in out.stderr
    assert not (tmp_path / "merged").exists()


def test_does_not_merge_when_the_required_checks_cannot_be_read(tmp_path: Path) -> None:
    out = run(tmp_path, [("pass", "build")], ["ci-gate"], protected=False)
    assert out.returncode == 3
    assert not (tmp_path / "merged").exists()


def test_a_failing_check_stops_without_merging(tmp_path: Path) -> None:
    out = run(tmp_path, [("fail", "build"), ("pass", "ci-gate")], ["ci-gate"])
    assert out.returncode == 1
    assert "build" in out.stdout
    assert not (tmp_path / "merged").exists()
