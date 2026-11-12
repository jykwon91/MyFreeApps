import type { PickedDraftLine } from "@myjobhunter/api-client/types/resume-refinement/picked-draft-line";

export interface ResumeDraftProps {
  source: string;
  highlightText: string | null;
  /** Lines can be picked for a fresh suggestion: only while the session is active. */
  canPick: boolean;
  isPickDisabled: boolean;
  onPick: (line: PickedDraftLine) => void;
  /** Where the draft starts on the page. */
  onLayout: (y: number) => void;
  /** Where the highlighted row sits in the draft, to scroll it into view. */
  onHighlightLayout: (y: number) => void;
}
