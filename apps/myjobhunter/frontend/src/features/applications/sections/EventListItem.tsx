import { Badge } from "@platform/ui";
import InterviewDetailsSummary from "@/features/applications/InterviewDetailsSummary";
import type {
  ApplicationEvent,
  ApplicationEventType,
} from "@/types/application-event";

const EVENT_LABELS: Record<ApplicationEventType, string> = {
  applied: "Applied",
  email_received: "Email received",
  interview_scheduled: "Interview scheduled",
  interview_completed: "Interview completed",
  rejected: "Rejected",
  offer_received: "Offer received",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
  note_added: "Note",
  follow_up_sent: "Follow-up sent",
};

const EVENT_BADGE_COLOR: Record<
  ApplicationEventType,
  "gray" | "blue" | "yellow" | "green" | "red" | "purple"
> = {
  applied: "blue",
  email_received: "gray",
  interview_scheduled: "yellow",
  interview_completed: "yellow",
  rejected: "red",
  offer_received: "green",
  withdrawn: "gray",
  ghosted: "gray",
  note_added: "purple",
  follow_up_sent: "blue",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

interface InterviewBlockProps {
  event: ApplicationEvent;
}

function InterviewBlock({ event }: InterviewBlockProps) {
  if (!event.interview_details) return null;
  return <InterviewDetailsSummary details={event.interview_details} />;
}

interface NoteBlockProps {
  note: string | null;
}

function NoteBlock({ note }: NoteBlockProps) {
  if (!note) return null;
  return <p className="text-sm mt-2 whitespace-pre-wrap">{note}</p>;
}

interface SourceBlockProps {
  source: ApplicationEvent["source"];
}

function SourceBlock({ source }: SourceBlockProps) {
  if (source === "manual") return null;
  return <p className="text-xs text-muted-foreground mt-1">via {source}</p>;
}

interface Props {
  event: ApplicationEvent;
}

export default function EventListItem({ event }: Props) {
  return (
    <li className="border rounded-lg p-3 bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <Badge
          label={EVENT_LABELS[event.event_type]}
          color={EVENT_BADGE_COLOR[event.event_type]}
        />
        <span className="text-xs text-muted-foreground">
          {formatDate(event.occurred_at)}
        </span>
      </div>
      <InterviewBlock event={event} />
      <NoteBlock note={event.note} />
      <SourceBlock source={event.source} />
    </li>
  );
}
