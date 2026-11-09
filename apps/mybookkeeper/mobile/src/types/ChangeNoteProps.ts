import type { ChangeFigures } from "@mybookkeeper/api-client/types/analytics/change-figures";

export interface ChangeNoteProps {
  figures: ChangeFigures;
  /** What it was in the stretch compared against. */
  previous: number;
  /** Whether a rise is good news (revenue, profit) or bad (expenses). */
  higherIsBetter: boolean;
  /** How the comparison reads aloud, such as "against the period before". */
  againstLabel: string;
}
