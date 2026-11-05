import type { TotpSetup } from "@platform/core/types/security/totp-setup";

export type TwoStepSetupResult =
  | { outcome: "started"; setup: TotpSetup }
  | { outcome: "wrong_password" }
  | { outcome: "already_on" }
  | { outcome: "rate_limited" }
  | { outcome: "failed" };
