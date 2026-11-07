/**
 * In-game icons are served same-origin by the API (`app/api/wow_icons.py`) from
 * object storage, at `{WOW_ICON_BASE}/{build}/{fileDataId}.webp` — so they also
 * load inside the Discord Activity. Published by `python -m scripts.wow_icons.publish`.
 */
export const WOW_ICON_BASE = "/api/wow/icons";

/** The sizes icons are drawn at (CSS px); the published art is 64px, sharp up to 32px at 2x. */
export const GAME_ICON_SIZES = [16, 24, 32, 48] as const;
