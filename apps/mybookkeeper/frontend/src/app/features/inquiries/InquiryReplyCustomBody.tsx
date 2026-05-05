import RenderedReplyEditor from "./RenderedReplyEditor";

export interface InquiryReplyCustomBodyProps {
  subject: string;
  body: string;
  isSending: boolean;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
}

export default function InquiryReplyCustomBody({
  subject,
  body,
  isSending,
  onSubjectChange,
  onBodyChange,
}: InquiryReplyCustomBodyProps) {
  return (
    <RenderedReplyEditor
      subject={subject}
      body={body}
      onSubjectChange={onSubjectChange}
      onBodyChange={onBodyChange}
      disabled={isSending}
    />
  );
}
