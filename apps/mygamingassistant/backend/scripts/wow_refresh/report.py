"""What a refresh changed, by name, so a reader can judge it without the JSON."""
from __future__ import annotations

import json
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

WOW_DATA = "frontend/src/games/wow-forever/data"
SHOWN_PER_SECTION = 40
# Records where the data came from, which a new build always changes.
PROVENANCE_KEYS = frozenset({"source", "generated_at", "client_build", "attribution"})

Rows = dict[str, tuple[str, Any]]


def _named_rows(key: str, id_field: str, name_field: str) -> Callable[[Any], Rows]:
    def rows(document: Any) -> Rows:
        return {str(r[id_field]): (str(r[name_field]), r) for r in document.get(key, [])}
    return rows


def _column_rows(key: str, id_column: str, name_column: str) -> Callable[[Any], Rows]:
    """Rows stored as arrays, with their column names in the same document."""
    def rows(document: Any) -> Rows:
        columns = document.get(f"{key[:-1]}Columns") or document.get("columns") or []
        if id_column not in columns or name_column not in columns:
            return {}
        at_id, at_name = columns.index(id_column), columns.index(name_column)
        return {str(r[at_id]): (str(r[at_name]), r) for r in document.get(key, [])}
    return rows


@dataclass(frozen=True)
class Section:
    title: str
    path: str
    rows: Callable[[Any], Rows]


SECTIONS = (
    Section("Food and drink", f"{WOW_DATA}/food/foods.json", _named_rows("foods", "id", "name")),
    Section("Tailoring recipes", f"{WOW_DATA}/professions/crafting/tailoring.json", _named_rows("recipes", "spell", "name")),
    Section("Enchanting recipes", f"{WOW_DATA}/professions/crafting/enchanting.json", _named_rows("recipes", "spell", "name")),
    Section("Maps and zones", f"{WOW_DATA}/worldMap/zones.json", _named_rows("zones", "id", "name")),
    Section("Flight points", f"{WOW_DATA}/worldMap/travel.json", _column_rows("nodes", "id", "name")),
    Section("Boats and zeppelins", f"{WOW_DATA}/worldMap/travel.json", _named_rows("transports", "id", "name")),
)


def _changed_fields(old: Any, new: Any) -> str:
    if isinstance(old, dict) and isinstance(new, dict):
        return ", ".join(sorted(k for k in old.keys() | new.keys() if old.get(k) != new.get(k)))
    return ""


def diff_section(section: Section, old_doc: Any, new_doc: Any) -> list[str]:
    old, new = section.rows(old_doc), section.rows(new_doc)
    lines = [f"- added: {new[k][0]}" for k in new.keys() - old.keys()]
    lines += [f"- removed: {old[k][0]}" for k in old.keys() - new.keys()]
    for key in old.keys() & new.keys():
        if old[key][1] != new[key][1]:
            fields = _changed_fields(old[key][1], new[key][1])
            lines.append(f"- changed: {new[key][0]}" + (f" ({fields})" if fields else ""))
    return sorted(lines)


def _committed(app_dir: Path, path: str) -> Any:
    shown = subprocess.run(
        ["git", "show", f"HEAD:./{path}"], cwd=app_dir, capture_output=True, check=False,
    )
    return json.loads(shown.stdout.decode("utf-8")) if shown.returncode == 0 else {}


def _strip_provenance(document: Any) -> Any:
    if isinstance(document, dict):
        return {k: v for k, v in document.items() if k not in PROVENANCE_KEYS}
    return document


def _changed_generated_files(app_dir: Path) -> list[str]:
    """Every changed JSON data file whose content moved beyond its provenance."""
    listed = subprocess.run(
        ["git", "diff", "--name-only", "--relative", "HEAD", "--", "*.json"],
        cwd=app_dir, capture_output=True, text=True, check=True,
    )
    moved = []
    for path in listed.stdout.split():
        current = json.loads((app_dir / path).read_text(encoding="utf-8"))
        if _strip_provenance(_committed(app_dir, path)) != _strip_provenance(current):
            moved.append(path)
    return moved


def render_report(app_dir: Path) -> str:
    out = ["## WoW Forever data changes", ""]
    for section in SECTIONS:
        lines = diff_section(
            section,
            _committed(app_dir, section.path),
            json.loads((app_dir / section.path).read_text(encoding="utf-8")),
        )
        if not lines:
            continue
        out += [f"### {section.title} ({len(lines)})", *lines[:SHOWN_PER_SECTION]]
        if len(lines) > SHOWN_PER_SECTION:
            out.append(f"- ...and {len(lines) - SHOWN_PER_SECTION} more")
        out.append("")
    moved = _changed_generated_files(app_dir)
    out += ["### Generated files with real changes", *(f"- `{p}`" for p in moved)]
    if not moved:
        out.append("- none: only the recorded build number moved")
    return "\n".join(out)
