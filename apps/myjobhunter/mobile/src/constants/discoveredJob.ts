import type { DismissalReason } from "@myjobhunter/api-client/types/discovery/dismissal-reason";
import { DISMISS_REASON_OPTIONS } from "@myjobhunter/api-client/constants/dismissReasons";
import type { SheetOption } from "@platform/mobile";

/** Copy for a discovered posting's card and its buttons. */
export const DISCOVERED_JOB_MESSAGES = {
  reScoring: "Re-scoring soon",
  scoring: "Scoring",
  notScored: "Not scored",
  posted: (ago: string) => `Posted ${ago}`,
  open: "Open",
  opening: "Opening…",
  apply: "Apply",
  applying: "Adding…",
  applied: "Applied",
  viewApplication: "View application",
  opensApplication: "Opens the application",
  save: "Save",
  saving: "Saving…",
  saved: "Saved",
  dismiss: "Dismiss",
  dismissing: "Dismissing…",
  dismissSheetTitle: "Why are you dismissing this?",
  restore: "Restore",
  restoring: "Restoring…",
  actionFor: (action: string, title: string, company: string) => `${action} ${title} at ${company}`,
} as const;

/** Dismissing without saying why. No reason the server knows is called this. */
export const SKIP_DISMISS_REASON = "skip";

/** The dismiss sheet's choices: the website's reasons, then its "skip". */
export const DISMISS_SHEET_OPTIONS: readonly SheetOption<DismissalReason | typeof SKIP_DISMISS_REASON>[] = [
  ...DISMISS_REASON_OPTIONS,
  { value: SKIP_DISMISS_REASON, label: "Skip — dismiss without a reason" },
];
