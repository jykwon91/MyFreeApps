import { Badge } from "@platform/ui";
import { Pencil } from "lucide-react";
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

const INTERVIEW_EVENT_TYPES = new Set<ApplicationEventType>([
  "interview_scheduled",
  "interview_completed",
]);

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
  onEditClick?: (event: ApplicationEvent) => void;
}

export default function EventListItem({ event, onEditClick }: Props) {
  const isInterviewEvent = INTERVIEW_EVENT_TYPES.has(event.event_type);
  const showEditButton = isInterviewEvent && onEditClick !== undefined;
  return (
    <li className="border rounded-lg p-3 bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <Badge
          label={EVENT_LABELS[event.event_type]}
          color={EVENT_BADGE_COLOR[event.event_type]}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {formatDate(event.occurred_at)}
          </span>
          {showEditButton ? (
            <button
              type="button"
              onClick={() => onEditClick(event)}
              aria-label="Edit interview details"
              className="text-muted-foreground hover:text-foreground rounded p-1 hover:bg-muted"
            >
              <Pencil size={14} />
            </button>
          ) : null}
        </div>
      </div>
      <InterviewBlock event={event} />
      <NoteBlock note={event.note} />
      <SourceBlock source={event.source} />
    </li>
  );
}
