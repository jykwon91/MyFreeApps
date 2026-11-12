/** How one kind of draft row is set. */
export interface DraftRowStyle {
  size: "xl" | "md" | "sm";
  weight: "400" | "700";
  uppercase: boolean;
  /** Space before it, as a section heading has. */
  gapAbove: boolean;
}
