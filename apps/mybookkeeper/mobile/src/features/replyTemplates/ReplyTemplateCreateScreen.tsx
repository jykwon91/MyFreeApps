import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import RequireWrite from "../workspace/RequireWrite";
import ReplyTemplateFormSkeleton from "./ReplyTemplateFormSkeleton";
import ReplyTemplateForm from "./ReplyTemplateForm";

export default function ReplyTemplateCreateScreen() {
  return (
    <RequireWrite loading={<ReplyTemplateFormSkeleton />} body={REPLY_TEMPLATE_MESSAGES.viewOnlyBody} heading={REPLY_TEMPLATE_MESSAGES.viewOnlyHeading}>
      <ReplyTemplateForm original={null} />
    </RequireWrite>
  );
}
