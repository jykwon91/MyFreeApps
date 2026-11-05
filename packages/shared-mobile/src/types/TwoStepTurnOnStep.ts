import type { TotpSetup } from "@platform/core/types/security/totp-setup";

export type TwoStepTurnOnStep =
  | { name: "password"; notice: string | null }
  | { name: "add"; setup: TotpSetup; notice: string | null }
  | { name: "codes"; codes: string[] }
  | { name: "onWithoutCodes" }
  | { name: "unsure"; setup: TotpSetup };
