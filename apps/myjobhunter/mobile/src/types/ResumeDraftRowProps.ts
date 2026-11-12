import type { DraftRow } from "./DraftRow";

export interface ResumeDraftRowProps {
  row: DraftRow;
  canPick: boolean;
  isPickDisabled: boolean;
  onPick: (row: DraftRow) => void;
  onHighlightLayout: (y: number) => void;
}
