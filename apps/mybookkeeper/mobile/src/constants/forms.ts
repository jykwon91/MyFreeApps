import { DISCARD_MESSAGES } from "@platform/mobile";

export const FORM_MESSAGES = {
  ...DISCARD_MESSAGES,
  cancel: "Cancel",
  viewOnlyHeading: "You have view-only access.",
  viewOnlyBody: "Ask the workspace owner to change your access.",
} as const;
