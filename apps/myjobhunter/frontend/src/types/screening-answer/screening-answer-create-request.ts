/**
 * Do NOT include is_eeoc — it is derived server-side from question_key.
 */
export interface ScreeningAnswerCreateRequest {
  question_key: string;
  answer: string | null;
}
