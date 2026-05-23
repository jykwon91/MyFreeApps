"""Lineup repository — thin re-export shim over the ``lineup/`` subpackage.

The actual implementations live in ``app/repositories/game/lineup/*.py`` —
split along the 4-pane storyboard so each pane's writers + backfill query
have their own module. See ``lineup/__init__.py`` for the package docstring
and the rationale behind the split (PR #758 sibling — same shim posture).

This module exists only to preserve the 25 ``from app.repositories.game.lineup_repo
import X`` call sites without churn. New code SHOULD import from
``app.repositories.game.lineup`` (or its leaf modules) directly.
"""
from __future__ import annotations

from app.repositories.game.lineup import (
    LineupFilters,
    accept_lineup,
    commit_classifier_run,
    create_lineup,
    get_ingested_video_ids,
    get_lineup,
    hide_lineup,
    list_accepted_lineups_needing_clips,
    list_accepted_lineups_needing_landing_clips,
    list_accepted_lineups_needing_micro_clips,
    list_accepted_lineups_needing_technique,
    list_accepted_lineups_needing_widen_source,
    list_lineups,
    list_pending_lineups,
    set_aim_clip_url,
    set_aim_screenshot_url,
    set_clip_url,
    set_clip_url_original,
    set_clip_url_trim,
    set_landing_clip_url,
    set_landing_clip_url_original,
    set_landing_clip_url_trim,
    set_stand_clip_url,
    set_stand_screenshot_url,
    set_technique,
    update_lineup,
    write_classifier_suggestions,
    zone_density,
)

__all__ = [
    "LineupFilters",
    "accept_lineup",
    "commit_classifier_run",
    "create_lineup",
    "get_ingested_video_ids",
    "get_lineup",
    "hide_lineup",
    "list_accepted_lineups_needing_clips",
    "list_accepted_lineups_needing_landing_clips",
    "list_accepted_lineups_needing_micro_clips",
    "list_accepted_lineups_needing_technique",
    "list_accepted_lineups_needing_widen_source",
    "list_lineups",
    "list_pending_lineups",
    "set_aim_clip_url",
    "set_aim_screenshot_url",
    "set_clip_url",
    "set_clip_url_original",
    "set_clip_url_trim",
    "set_landing_clip_url",
    "set_landing_clip_url_original",
    "set_landing_clip_url_trim",
    "set_stand_clip_url",
    "set_stand_screenshot_url",
    "set_technique",
    "update_lineup",
    "write_classifier_suggestions",
    "zone_density",
]
