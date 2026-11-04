/**
 * Mirrors backend ``ReplyTemplateResponse``.
 *
 * Templates are per-user (PR 2.3 ships them as private; org-shared lands
 * later). ``body_template`` is plaintext with ``$variable`` tokens that the
 * backend renderer substitutes at preview / send time.
 */
export interface ReplyTemplate {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  subject_template: string;
  body_template: string;
  is_archived: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}
