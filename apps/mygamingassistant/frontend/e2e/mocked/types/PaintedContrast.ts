/** WCAG contrast ratios read from the painted page (see fixtures/contrast.ts). */
export interface PaintedContrast {
  /** The element's text colour against its backdrop. */
  text: number;
  /** The element's backdrop against its parent's: how visible its box is (3:1 for a UI component). */
  box: number;
  /** Its box-shadow ring (Tailwind `ring-*`) against its parent's backdrop; null when it has no ring. */
  ring: number | null;
}
