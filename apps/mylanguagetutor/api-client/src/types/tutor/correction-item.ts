import type { CorrectionErrorType } from "./correction-error-type";
import type { CorrectionSeverity } from "./correction-severity";
import type { FeedbackMove } from "./feedback-move";

/**
 * Mirrors ``CorrectionItem`` in backend ``app/schemas/tutor/turn_schemas.py``
 * -- change together.
 */
export interface CorrectionItem {
  error_span: string;
  corrected_span: string;
  full_corrected_sentence: string;
  error_type: CorrectionErrorType;
  severity: CorrectionSeverity;
  feedback_move: FeedbackMove;
  explanation: string;
}
