import type { SourceType } from "@mybookkeeper/api-client/types/tax/SourceType";
import type { ValidationStatus } from "@mybookkeeper/api-client/types/tax/ValidationStatus";

export const TAX_FORM_SKELETON_ROWS = [0, 1, 2, 3, 4] as const;

export const TAX_SOURCE_LABELS: Record<SourceType, string> = {
  extracted: "Read from a document",
  computed: "Worked out by me",
  manual: "Entered by hand",
};

export const TAX_FIELD_STATUS_LABELS: Record<ValidationStatus, string> = {
  valid: "Checks out",
  warning: "Worth a look",
  error: "Needs fixing",
  unvalidated: "Not checked yet",
};

export const TAX_FORM_MESSAGES = {
  loading: "Loading this form",
  tryAgain: "Try again",
  checkConnection: "Check your connection and try again.",
  tryAgainLater: "Please try again in a bit.",
  couldntLoad: "I couldn't load this form.",
  couldntFind: "I couldn't find that form.",
  couldntFindBody: "It may have been removed when the return was recalculated.",
  noneHeading: "I don't have any data for this form.",
  noneBody: "Recalculate the return and I'll look again.",
  viewSource: "View the document",
  calculated: "Calculated",
  overridden: "Overridden",
  editHint: "Opens a form to override this value",
  readOnlyNote: "Only owners and admins can override a value.",
  fieldAccessibility: (label: string, value: string, source: string, status: string) => `${label}, ${value}. ${source}. ${status}.`,
} as const;
