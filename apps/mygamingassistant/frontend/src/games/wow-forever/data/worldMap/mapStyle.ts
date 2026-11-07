import type { MapStyleOption } from "@/games/wow-forever/types/mapStyle/mapStyleOption";

export const MAP_STYLE = { drawn: "drawn", satellite: "satellite" } as const;

/** The Map / Satellite choice, saved on this device. */
export const MAP_STYLE_STORAGE_KEY = "mga.wowForever.worldMap.style.v1";

export const MAP_STYLE_OPTIONS: readonly MapStyleOption[] = [
  { value: MAP_STYLE.drawn, label: "Map" },
  { value: MAP_STYLE.satellite, label: "Satellite" },
];

/** Radio-group keys on the toggle: how far each moves the choice. */
export const MAP_STYLE_ARROW_STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * Satellite views are served same-origin by the API (`app/api/wow_icons.py`)
 * from object storage, at `{SATELLITE_BASE}/{build}/{uiMapId}.webp`.
 * Published by `python -m scripts.wow_satellite.publish`.
 */
export const SATELLITE_BASE = "/api/wow/satellite";

/*
 * Busy terrain needs stronger outlines than the parchment. MapCanvas marks the
 * viewer `group/viewer` with `data-map-style`; these switch on only while the
 * satellite view is on screen.
 */
/** The dark casing under route lines. */
export const SATELLITE_LINE_HALO = "group-data-[map-style=satellite]/viewer:stroke-black/90";
/** The dark halo round label text. */
export const SATELLITE_LABEL_HALO =
  "group-data-[map-style=satellite]/viewer:stroke-black group-data-[map-style=satellite]/viewer:[stroke-width:7px]";
/** A thin dark rim round every marker, so white rings don't vanish on pale ground. */
export const SATELLITE_MARKER_RIM = "group-data-[map-style=satellite]/viewer:drop-shadow-[0_0_1.5px_rgb(0_0_0)]";
