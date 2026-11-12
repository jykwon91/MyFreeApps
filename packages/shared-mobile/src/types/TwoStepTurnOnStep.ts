import type { TotpSetup } from "@platform/core/types/security/totp-setup";
import type { TWO_STEP_TURN_ON_STEP as STEP } from "../constants/twoStepTurnOnStepName";

export type TwoStepTurnOnStep =
  | { name: typeof STEP.PASSWORD; notice: string | null }
  | { name: typeof STEP.ADD; setup: TotpSetup; notice: string | null }
  | { name: typeof STEP.CODES; codes: string[] }
  | { name: typeof STEP.ON_WITHOUT_CODES }
  | { name: typeof STEP.UNSURE; setup: TotpSetup };
