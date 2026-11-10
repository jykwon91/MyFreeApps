import { INQUIRY_REPLY_VIEW_ONLY_BODY } from "../../constants/inquiries";
import RequireWrite from "../workspace/RequireWrite";
import InquiryReplyBody from "./InquiryReplyBody";
import InquiryReplySkeleton from "./InquiryReplySkeleton";

/** Writes a reply to an inquiry. A viewer is told they can't, and nothing is fetched for them. */
export default function InquiryReplyScreen({ id }: { id: string }) {
  return (
    <RequireWrite body={INQUIRY_REPLY_VIEW_ONLY_BODY} loading={<InquiryReplySkeleton />}>
      <InquiryReplyBody id={id} />
    </RequireWrite>
  );
}
