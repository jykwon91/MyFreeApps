import type { DismissalReason } from "../types/discovery/dismissal-reason";
import type { LabelledOption } from "../types/discovery/labelled-option";

/** Why a posting is being dismissed, in the order the picker offers them. */
export const DISMISS_REASON_OPTIONS: readonly LabelledOption<DismissalReason>[] = [
  { value: "wrong_stack", label: "Wrong tech stack" },
  { value: "too_small_company", label: "Company too small" },
  { value: "wrong_sector", label: "Wrong industry / sector" },
  { value: "wrong_comp", label: "Compensation mismatch" },
  { value: "not_remote", label: "Not actually remote" },
  { value: "not_interested", label: "Not interested" },
  { value: "other", label: "Other" },
];
