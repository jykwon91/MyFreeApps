export interface ReplyTemplateUpdateRequest {
  name?: string;
  subject_template?: string;
  body_template?: string;
  display_order?: number;
  is_archived?: boolean;
}
