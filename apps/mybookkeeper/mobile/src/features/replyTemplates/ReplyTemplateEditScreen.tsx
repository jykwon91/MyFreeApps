import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import RequireWrite from "../workspace/RequireWrite";
import ReplyTemplateEditLoader from "./ReplyTemplateEditLoader";
import ReplyTemplateFormSkeleton from "./ReplyTemplateFormSkeleton";

/** Edits a reply template. A viewer is told they can't, and the list isn't fetched for them. */
export default function ReplyTemplateEditScreen({ id }: { id: string }) {
  return (
    <RequireWrite body={REPLY_TEMPLATE_MESSAGES.viewOnlyBody} heading={REPLY_TEMPLATE_MESSAGES.viewOnlyHeading} loading={<ReplyTemplateFormSkeleton />}>
      <ReplyTemplateEditLoader id={id} />
    </RequireWrite>
  );
}
