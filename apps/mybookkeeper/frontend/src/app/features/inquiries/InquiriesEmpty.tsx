import EmptyState from "@/shared/components/ui/EmptyState";
import { INQUIRY_MESSAGES } from "@/shared/lib/inquiry-messages";

export interface InquiriesEmptyProps {
  isFiltered: boolean;
  canWrite: boolean;
}

export default function InquiriesEmpty({ isFiltered, canWrite }: InquiriesEmptyProps) {
  if (isFiltered) return <EmptyState message={INQUIRY_MESSAGES.noInquiriesInStage} />;
  if (canWrite) return <EmptyState message={INQUIRY_MESSAGES.noInquiries} />;
  return <EmptyState message={INQUIRY_MESSAGES.noInquiriesViewer} />;
}
