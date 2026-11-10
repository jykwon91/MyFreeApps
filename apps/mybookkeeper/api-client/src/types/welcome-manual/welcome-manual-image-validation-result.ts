import type { WelcomeManualImageCandidate } from "./welcome-manual-image-candidate";

export interface WelcomeManualImageValidationResult<T extends WelcomeManualImageCandidate> {
  valid: T[];
  rejected: string[];
}
