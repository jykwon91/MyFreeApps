import type { MapMarkStyle } from "@/games/wow-forever/data/worldMap/mapMarkStyles";

/** One look a mark can have: colour + glyph, never colour alone. */
export interface MapMarkStyleDef {
  id: MapMarkStyle;
  /** One letter, what a share link carries. */
  code: string;
  name: string;
  /** The label a new mark of this style starts with. */
  defaultLabel: string;
  /** Drawn inside the marker. */
  glyph: string;
  /** The marker's fill (SVG). */
  fillClass: string;
  /** The glyph's fill (SVG). */
  glyphClass: string;
  /** The same look for an HTML swatch in the list. */
  swatchClass: string;
}
