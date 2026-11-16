import { MAP_H, MAP_W } from "@/games/wow-forever/data/worldMap/mapViewer";
import { EDGE_BAND_PX } from "@/games/wow-forever/worldMap/edgeLabelLayout";

/** Room (px) the map panel needs round the picture, top to bottom, while it sticks to the top of the page. */
const ABOVE_AND_BELOW_PX =
  16 + // `lg:top-4`, where the panel sticks
  44 + // the "Map: <zone>" heading row with Share
  12 + // `space-y-3`
  44 + // the breadcrumb row ("Zoom out › Azeroth › …"), thumb-sized
  12 + // `space-y-3` between it and the map
  2 * EDGE_BAND_PX + // the neighbour labels' band, above and below the picture
  8 + // MapCanvas's `space-y-2` before the hover line
  32 + // the hover line ("Elwynn Forest · Level 5–10")
  16; // a little air below

/**
 * Theater mode's map panel: as wide as its column allows, but never so wide the whole picture
 * stops fitting the window's height — on a wide, short window it fits the height instead.
 */
export const THEATER_PANEL_MAX_WIDTH = `calc((100dvh - ${ABOVE_AND_BELOW_PX}px) * ${MAP_W / MAP_H} + ${2 * EDGE_BAND_PX}px)`;

/** The page in theater mode: the list column keeps its size, the map column gets three times as much. */
export const THEATER_GRID_CLASSES = "lg:grid-cols-[minmax(18rem,1fr)_3fr]";
