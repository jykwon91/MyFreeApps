import { MAP_H, MAP_W } from "@/games/wow-forever/data/worldMap/mapViewer";
import { EDGE_BAND_PX } from "@/games/wow-forever/worldMap/edgeLabelLayout";

/** Side padding (px, each side) of the map section in theater mode (`px-3`). */
const SECTION_PADDING_INLINE_PX = 12;

/** Room (px) the theater map section leaves round the picture, top to bottom. */
const ABOVE_AND_BELOW_PX =
  2 * 8 + // `py-2` on the section
  44 + // the breadcrumb row ("Zoom out › Azeroth › …"), thumb-sized
  12 + // `space-y-3` between it and the map
  2 * EDGE_BAND_PX + // the neighbour labels' band, above and below the picture
  8 + // MapCanvas's `space-y-2` before the hover line
  32; // the hover line ("Elwynn Forest · Level 5–10")

/** Set on the overlay: the route strip stacked above the map on a phone, none beside it from `md`. */
const THEATER_STRIP_VAR = "--theater-strip";
export const THEATER_OVERLAY_STRIP_CLASSES = "[--theater-strip:9rem] md:[--theater-strip:0px]";

/**
 * The widest the theater map section can be with the whole picture on screen,
 * so on a wide, short window the map fits the height instead of scrolling.
 */
export const THEATER_SECTION_MAX_WIDTH =
  `calc((100dvh - ${ABOVE_AND_BELOW_PX}px - var(${THEATER_STRIP_VAR}, 0px)) * ${MAP_W / MAP_H} + ${2 * EDGE_BAND_PX + 2 * SECTION_PADDING_INLINE_PX}px)`;
