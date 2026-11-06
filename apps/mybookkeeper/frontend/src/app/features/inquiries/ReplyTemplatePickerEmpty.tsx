import { Link } from "react-router-dom";
import { REPLY_TEMPLATE_MESSAGES } from "@/shared/lib/reply-template-messages";

export interface ReplyTemplatePickerEmptyProps {
  /** Closes the reply panel, so it doesn't linger over the page it opens. */
  onNavigate: () => void;
}

export default function ReplyTemplatePickerEmpty({ onNavigate }: ReplyTemplatePickerEmptyProps) {
  return (
    <div className="text-sm text-muted-foreground p-4 space-y-1" data-testid="reply-template-picker-empty">
      <p>{REPLY_TEMPLATE_MESSAGES.pickerEmpty}</p>
      <Link
        to="/reply-templates"
        onClick={onNavigate}
        className="inline-flex min-h-[44px] items-center text-primary underline underline-offset-2"
      >
        {REPLY_TEMPLATE_MESSAGES.pickerEmptyLink}
      </Link>
    </div>
  );
}
