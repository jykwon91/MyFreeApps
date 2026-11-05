import { EmptyState } from "@platform/mobile";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import { useCanWrite } from "../workspace/useCanWrite";
import ReplyTemplateForm from "./ReplyTemplateForm";

export default function ReplyTemplateCreateScreen() {
  const canWrite = useCanWrite();
  if (!canWrite) return <EmptyState body={REPLY_TEMPLATE_MESSAGES.viewOnlyBody} heading={REPLY_TEMPLATE_MESSAGES.viewOnlyHeading} />;
  return <ReplyTemplateForm original={null} />;
}
