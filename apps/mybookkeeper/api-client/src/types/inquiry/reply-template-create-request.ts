export interface ReplyTemplateCreateRequest {
  name: string;
  subject_template: string;
  body_template: string;
  display_order?: number;
}
