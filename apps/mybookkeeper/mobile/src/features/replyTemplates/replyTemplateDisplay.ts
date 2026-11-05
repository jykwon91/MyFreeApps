import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { REPLY_TEMPLATE_VARIABLES } from "../../constants/replyTemplates";
import type { ReplyTemplateVariable } from "../../types/ReplyTemplateVariable";

export function variablesUsed(template: Pick<ReplyTemplate, "subject_template" | "body_template">): ReplyTemplateVariable[] {
  return REPLY_TEMPLATE_VARIABLES.filter(({ token }) => template.subject_template.includes(token) || template.body_template.includes(token));
}
