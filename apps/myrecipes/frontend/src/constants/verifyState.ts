export const VerifyState = {
  VERIFYING: "verifying",
  SUCCESS: "success",
  ERROR: "error",
} as const;

export type VerifyState = (typeof VerifyState)[keyof typeof VerifyState];
