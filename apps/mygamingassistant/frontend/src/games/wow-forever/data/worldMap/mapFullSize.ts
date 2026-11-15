import { MAP_H, MAP_W } from "@/games/wow-forever/data/worldMap/mapViewer";
import { EDGE_BAND_PX } from "@/games/wow-forever/worldMap/edgeLabelLayout";

/** Room (px) a full-size map leaves round itself, top to bottom. */
const ABOVE_AND_BELOW_PX =
  2 * 12 + // `py-3` in FULL_SIZE_CLASS
  44 + // the breadcrumb row ("Zoom out › Azeroth › …"), thumb-sized
  12 + // `space-y-3` between it and the map
  2 * EDGE_BAND_PX + // the neighbour labels' band, above and below the picture
  8 + // MapCanvas's `space-y-2` before the hover line
  32; // the hover line ("Elwynn Forest · Level 5–10")

/** The widest the map's frame can be with all of it on screen. */
const FIT_WIDTH = `((100dvh - ${ABOVE_AND_BELOW_PX}px) * ${MAP_W / MAP_H} + ${2 * EDGE_BAND_PX}px)`;

/**
 * Full size: the map section covers the whole window, page chrome included
 * (`h-dvh w-screen`, not `inset-0`, which stops short of a horizontal
 * scrollbar), under the toasts (z-[2000]). What doesn't fit under the map
 * (marks, legend) scrolls.
 */
export const FULL_SIZE_CLASS = "fixed left-0 top-0 z-[1050] h-dvh w-screen space-y-3 overflow-auto bg-background py-3";

/** Side padding that centres the section's content at the width that fits, never under 12px. */
export const FULL_SIZE_PADDING_INLINE = `max(12px, calc((100vw - ${FIT_WIDTH}) / 2))`;
