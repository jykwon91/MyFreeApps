/** One line of the draft as the preview shows it. */
export interface DraftLine {
  /** The line's markdown, bullet marker stripped: sent as-is when picked, so the server's replace still matches. */
  text: string;
  /** It holds the text being refined now. */
  highlight: boolean;
  /** It can be picked for a fresh suggestion: after the first ## heading, and not already the target. */
  pickable: boolean;
  /** The nearest ## heading above it, the section a picked line is filed under. */
  section: string;
}
