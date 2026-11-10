/**
 * ScreeningAnswer as returned by the backend.
 * Mirrors ScreeningAnswerResponse in backend/app/schemas/profile/screening_answer_response.py.
 *
 * Note: is_eeoc is server-derived from question_key. Never send it in requests.
 */
export interface ScreeningAnswer {
  id: string;
  user_id: string;
  profile_id: string;
  question_key: string;
  answer: string | null;
  is_eeoc: boolean;
  created_at: string;
  updated_at: string;
}
