export interface Motion {
  /** False while Reduce Motion is on, or until the setting has been read. */
  isAnimated: boolean;
  /** The `animationType` for a Modal: it slides unless motion is reduced. */
  sheetAnimation: "slide" | "none";
}
