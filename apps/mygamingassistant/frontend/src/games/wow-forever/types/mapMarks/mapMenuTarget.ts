/** Where the map menu was opened: the map point (0..100) and where to draw the menu inside the map box (px). */
export interface MapMenuTarget {
  x: number;
  y: number;
  boxX: number;
  boxY: number;
  /** The map box's size, so the menu can open away from the nearest edges. */
  boxWidth: number;
  boxHeight: number;
}
