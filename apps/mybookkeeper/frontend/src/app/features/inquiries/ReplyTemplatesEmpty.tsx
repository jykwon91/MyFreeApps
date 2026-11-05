import EmptyState from "@/shared/components/ui/EmptyState";
import { REPLY_TEMPLATE_MESSAGES as MESSAGES } from "@/shared/lib/reply-template-messages";

export interface ReplyTemplatesEmptyProps {
  canWrite: boolean;
}

export default function ReplyTemplatesEmpty({ canWrite }: ReplyTemplatesEmptyProps) {
  return <EmptyState message={canWrite ? MESSAGES.noActive : MESSAGES.noActiveViewer} />;
}
