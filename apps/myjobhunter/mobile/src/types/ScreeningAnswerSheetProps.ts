import type { ScreeningAnswer } from "@myjobhunter/api-client/types/screening-answer/screening-answer";

export interface ScreeningAnswerSheetProps {
  /** The answer to edit; leave out to add one. */
  existing?: ScreeningAnswer;
  /** The questions answered already, which can't be answered twice. */
  answeredKeys: readonly string[];
  onClose: () => void;
}
