import type { TotpSetup } from "@platform/core/types/security/totp-setup";
import type { TwoStepCodeProblem } from "./TwoStepCodeProblem";

export interface TwoStepAddStepProps {
  appName: string;
  setup: TotpSetup;
  notice: string | null;
  /** The problem with the field, or null if it was dealt with elsewhere. */
  onSubmit: (code: string) => Promise<TwoStepCodeProblem | null>;
}
