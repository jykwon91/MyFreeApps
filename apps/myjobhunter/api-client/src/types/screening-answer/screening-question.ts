import type { ScreeningQuestionKey } from "./screening-question-key";

/** A question a screening answer can be saved for. */
export interface ScreeningQuestion {
  key: ScreeningQuestionKey;
  label: string;
  /** In `EEOC_KEYS`, so the server marks the answer `is_eeoc`. */
  eeoc: boolean;
}
