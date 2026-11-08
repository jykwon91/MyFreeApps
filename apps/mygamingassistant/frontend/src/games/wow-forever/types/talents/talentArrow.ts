/** One prerequisite arrow in a tree's grid, in CSS pixels. */
export interface TalentArrow {
  /** Index of the talent the arrow points at. */
  to: number;
  /** Index of the talent it needs. */
  from: number;
  /** The line, as SVG `points`. */
  line: string;
  /** The arrowhead triangle, as SVG `points`. */
  head: string;
}
