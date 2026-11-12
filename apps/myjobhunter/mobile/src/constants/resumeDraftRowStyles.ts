import type { DraftRow } from "../types/DraftRow";
import type { DraftRowStyle } from "../types/DraftRowStyle";

/** How each kind of draft row is set, after the website's preview: a big name, capitalized sections. */
export const RESUME_DRAFT_ROW_STYLES: Record<DraftRow["kind"], DraftRowStyle> = {
  heading1: { size: "xl", weight: "700", uppercase: false, gapAbove: false },
  heading2: { size: "md", weight: "700", uppercase: true, gapAbove: true },
  heading3: { size: "sm", weight: "700", uppercase: false, gapAbove: false },
  paragraph: { size: "sm", weight: "400", uppercase: false, gapAbove: false },
  bullet: { size: "sm", weight: "400", uppercase: false, gapAbove: false },
};
