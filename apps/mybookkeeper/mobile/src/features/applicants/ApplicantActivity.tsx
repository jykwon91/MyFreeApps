import type { ApplicantEvent } from "@mybookkeeper/api-client/types/applicant/applicant-event";
import { applicantEventLabel } from "@mybookkeeper/api-client/utils/applicantEvents";
import CollapsibleSection from "../inquiries/CollapsibleSection";
import { eventLines, shortDate } from "./applicantDisplay";
import ApplicantHistoryItem from "./ApplicantHistoryItem";

export default function ApplicantActivity({ events }: { events: ApplicantEvent[] }) {
  if (events.length === 0) return null;
  return (
    <CollapsibleSection preview={applicantEventLabel(events[events.length - 1].event_type)} title="Activity">
      {events.map((event) => (
        <ApplicantHistoryItem key={event.id} lines={eventLines(event)} right={shortDate(event.occurred_at)} title={applicantEventLabel(event.event_type)} />
      ))}
    </CollapsibleSection>
  );
}
