import type { TwoStepStatusFailure } from "./TwoStepStatusFailure";

/** Whether two-step sign-in is on, as useTwoStepStatus last read it. */
export interface TwoStepStatus {
  /** Null until the first read. It stays as last read when a reload fails, so a failure never reads as "off". */
  enabled: boolean | null;
  failure: TwoStepStatusFailure | null;
  successfulReads: number;
  reload: () => Promise<void>;
  /** The server just said so, which beats any read still on its way. */
  markEnabled: (isEnabled: boolean) => void;
}
