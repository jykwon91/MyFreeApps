import type { MAP_STYLE } from "@/games/wow-forever/data/worldMap/mapStyle";

/** How a zone's ground is drawn: the client's map art, or the satellite view from its minimap. */
export type MapStyle = (typeof MAP_STYLE)[keyof typeof MAP_STYLE];
