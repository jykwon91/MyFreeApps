/** A rendered element's bounding box, as Playwright measures it (CSS px, relative to the main frame's viewport). */
export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
