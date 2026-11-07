/**
 * How far a map picture is zoomed and where it is centred. Kept as fractions of
 * the picture (not pixels), so a view survives the map being resized.
 * `scale` 1 = the whole picture fits; `centerX` / `centerY` are 0..1 across / down it.
 */
export interface MapViewport {
  scale: number;
  centerX: number;
  centerY: number;
}
