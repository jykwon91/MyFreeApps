export const ResendStatusMode = {
  IDLE: "idle",
  SENDING: "sending",
  SENT: "sent",
  ERROR: "error",
} as const;

export type ResendStatusMode = (typeof ResendStatusMode)[keyof typeof ResendStatusMode];
