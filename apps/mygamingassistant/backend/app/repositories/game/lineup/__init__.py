"""Lineup repository — split across sibling modules along the 4-pane storyboard.

This package is the post-split home of what used to live in
``app/repositories/game/lineup_repo.py``. The original ``lineup_repo``
remains as a thin re-export shim so the 25 existing import sites do not
churn; new code MAY import from this package directly for clarity.

Filters follow "any" semantics for side: a lineup with side='any' always
appears in side_a and side_b queries, so players see utility that works
on both sides. All filter parameters are optional. Omitting them returns
all rows that pass the status filter (default: accepted only).
"""
from __future__ import annotations

from app.repositories.game.lineup.density import zone_density
from app.repositories.game.lineup.filters import LineupFilters
from app.repositories.game.lineup.landing_pane import (
    list_accepted_lineups_needing_landing_clips,
    list_accepted_lineups_needing_posters,
    set_landing_clip_url,
    set_landing_clip_url_original,
    set_landing_clip_url_trim,
    set_landing_screenshot_url,
)
from app.repositories.game.lineup.lifecycle import (
    accept_lineup,
    commit_classifier_run,
    create_lineup,
    get_ingested_video_ids,
    get_lineup,
    hide_lineup,
    list_lineups,
    list_pending_lineups,
    update_lineup,
    upsert_imported_lineup,
    write_classifier_suggestions,
)
from app.repositories.game.lineup.micro_panes import (
    list_accepted_lineups_needing_micro_clips,
    set_aim_clip_url,
    set_aim_localization,
    set_aim_screenshot_url,
    set_stand_clip_url,
    set_stand_localization,
    set_stand_screenshot_url,
)
from app.repositories.game.lineup.technique import (
    list_accepted_lineups_needing_technique,
    set_technique,
)
from app.repositories.game.lineup.throw_pane import (
    list_accepted_lineups_needing_clips,
    list_accepted_lineups_needing_widen_source,
    set_clip_url,
    set_clip_url_original,
    set_clip_url_trim,
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
    "list_accepted_lineups_needing_posters",
    "list_accepted_lineups_needing_technique",
    "list_accepted_lineups_needing_widen_source",
    "list_lineups",
    "list_pending_lineups",
    "upsert_imported_lineup",
    "set_aim_clip_url",
    "set_aim_localization",
    "set_aim_screenshot_url",
    "set_clip_url",
    "set_clip_url_original",
    "set_clip_url_trim",
    "set_landing_clip_url",
    "set_landing_clip_url_original",
    "set_landing_clip_url_trim",
    "set_landing_screenshot_url",
    "set_stand_clip_url",
    "set_stand_localization",
    "set_stand_screenshot_url",
    "set_technique",
    "update_lineup",
    "write_classifier_suggestions",
    "zone_density",
]
