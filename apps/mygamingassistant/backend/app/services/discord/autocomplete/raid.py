"""Autocomplete for /raid options.

* ``spec`` (prefs) — the specs of the class filled in beside it ("Fury"),
  else every spec ("Fury Warrior"), narrowed by what's typed; the value is
  ``<class>.<spec>``.

Autocomplete can't show errors, so anything unexpected returns no choices.
"""
from __future__ import annotations

from typing import Any

from app.services.discord.interaction import Interaction, autocomplete_response
from app.services.wow.raid_catalog import CLASSES_BY_KEY, WowSpecInfo, search_specs


async def handle_raid_autocomplete(interaction: Interaction) -> dict[str, Any]:
    if interaction.focused_option != "spec":
        return autocomplete_response([])
    query = interaction.str_option("spec") or ""
    wow_class = interaction.str_option("class")
    if wow_class not in CLASSES_BY_KEY:
        wow_class = None
    specs = search_specs(query, wow_class)
    return autocomplete_response([_choice(spec, class_given=wow_class is not None) for spec in specs])


def _choice(spec: WowSpecInfo, *, class_given: bool) -> dict[str, str]:
    """With the class filled in, "Fury" is enough; across classes the name needs it."""
    name = spec.full_label
    if class_given:
        name = spec.label
    return {"name": name, "value": spec.choice_value}
