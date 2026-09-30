/**
 * Mirrors backend ``app/domain/tutoring/correction_vocabulary.py`` and
 * ``CorrectionItem`` in ``app/schemas/tutor/turn_schemas.py`` -- change together.
 */
export type CorrectionErrorType =
  | "lexical"
  | "verb_form"
  | "agreement"
  | "gender"
  | "word_order"
  | "missing_word"
  | "english_insertion";

export type CorrectionSeverity = "blocks_meaning" | "noticeable" | "minor";

export type FeedbackMove = "recast" | "elicitation" | "clarification" | "explicit";

export interface CorrectionItem {
  error_span: string;
  corrected_span: string;
  full_corrected_sentence: string;
  error_type: CorrectionErrorType;
  severity: CorrectionSeverity;
  feedback_move: FeedbackMove;
  explanation: string;
}
