import type { ApplicantDetailResponse } from "@mybookkeeper/api-client/types/applicant/applicant-detail-response";
import { applicantEventLabel } from "@mybookkeeper/api-client/utils/applicantEvents";
import { useTheme } from "@platform/mobile";
import { View } from "react-native";
import CollapsibleSection from "../inquiries/CollapsibleSection";
import InquiryLine from "../inquiries/InquiryLine";
import InquirySection from "../inquiries/InquirySection";
import TransactionFact from "../transactions/TransactionFact";
import { shortDate } from "./applicantDisplay";

export default function ApplicantHistory({ applicant }: { applicant: ApplicantDetailResponse }) {
  const { spacing } = useTheme();
  const { references, video_call_notes: calls, events } = applicant;

  return (
    <View style={{ gap: spacing.lg }}>
      {references.length > 0 ? (
        <InquirySection title="References">
          {references.map((reference) => (
            <TransactionFact key={reference.id} label={reference.relationship} value={reference.reference_name} />
          ))}
        </InquirySection>
      ) : null}

      {calls.length > 0 ? (
        <InquirySection title="Video calls">
          {calls.map((call) => (
            <TransactionFact key={call.id} label={shortDate(call.completed_at ?? call.scheduled_at)} value={call.notes?.trim() || "No notes"} />
          ))}
        </InquirySection>
      ) : null}

      {events.length > 0 ? (
        <CollapsibleSection preview={applicantEventLabel(events[events.length - 1].event_type)} title="Activity">
          {events.map((event) => (
            <InquiryLine key={event.id} left={applicantEventLabel(event.event_type)} muted right={shortDate(event.occurred_at)} />
          ))}
        </CollapsibleSection>
      ) : null}
    </View>
  );
}
