import type { CorrectionItem } from "@mylanguagetutor/api-client/types/tutor/correction-item";

/** What a finished turn carries; everything but the reply is optional. */
export interface CompleteTurnOptions {
  reply: string;
  translation?: string | null;
  corrections?: CorrectionItem[];
  retryPrompt?: string | null;
  goalsMet?: number[];
  complete?: boolean;
  remainingFraction?: number;
}
