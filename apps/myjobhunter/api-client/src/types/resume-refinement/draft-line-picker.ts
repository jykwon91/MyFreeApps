import type { PickedDraftLine } from "./picked-draft-line";

/** Picking a draft line for a fresh suggestion, and which line the draft highlights meanwhile. */
export interface DraftLinePicker {
  /** The picked line until the session moves onto it, otherwise the session's target. */
  highlightText: string | null;
  isPicking: boolean;
  /** True once the session holds the new target; false if picking failed or another pick is in flight. */
  pick: (line: PickedDraftLine) => Promise<boolean>;
}
