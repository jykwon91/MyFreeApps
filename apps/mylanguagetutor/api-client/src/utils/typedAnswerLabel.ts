import { PRACTICE_COPY } from "../constants/practiceCopy";

/** The typed answer's label: plain where the learner could speak instead, marked as typing practice where they can't. */
export function typedAnswerLabel(recognitionSupported: boolean): string {
  return recognitionSupported ? PRACTICE_COPY.typeYourAnswer : PRACTICE_COPY.typingOnlyLabel;
}
