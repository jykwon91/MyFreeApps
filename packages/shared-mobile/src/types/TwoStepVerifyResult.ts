export type TwoStepVerifyResult =
  | { outcome: "turned_on"; recoveryCodes: string[] }
  | { outcome: "wrong_code" }
  | { outcome: "not_started" }
  | { outcome: "already_on" }
  | { outcome: "rate_limited" }
  | { outcome: "unknown" };
