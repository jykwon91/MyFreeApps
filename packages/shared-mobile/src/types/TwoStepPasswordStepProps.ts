import type { TotpSetup } from "@platform/core/types/security/totp-setup";

export interface TwoStepPasswordStepProps {
  appName: string;
  notice: string | null;
  onStarted: (setup: TotpSetup) => void;
  onAlreadyOn: () => void;
}
