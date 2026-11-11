import { Badge } from "@platform/ui";
import { Pencil } from "lucide-react";
import InlineEditForm from "./InlineEditForm";
import InterviewBlock from "./InterviewBlock";
import NoteBlock from "./NoteBlock";
import SourceBlock from "./SourceBlock";
import { INTERVIEW_EVENT_TYPES } from "@myjobhunter/api-client/constants/interviewEventTypes";
import type { ApplicationEvent } from "@myjobhunter/api-client/types/application-event";
import { EVENT_BADGE_COLORS } from "@/constants/event-badge-colors";
import { EVENT_LABELS } from "@/constants/event-labels";
import { formatLocalDateTime } from "@/lib/format-local-date-time";

interface Props {
  applicationId: string;
  event: ApplicationEvent;
  isEditing?: boolean;
  onEditClick?: (event: ApplicationEvent) => void;
  onCancelEdit?: () => void;
  onSaved?: () => void;
}

export default function EventListItem({
  applicationId,
  event,
  isEditing = false,
  onEditClick,
  onCancelEdit,
  onSaved,
}: Props) {
  const isInterviewEvent = INTERVIEW_EVENT_TYPES.has(event.event_type);
  const showEditButton =
    isInterviewEvent && onEditClick !== undefined && !isEditing;
  const editingInline =
    isEditing && isInterviewEvent && onCancelEdit !== undefined && onSaved !== undefined;

  return (
    <li className="border rounded-lg p-3 bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <Badge
          label={EVENT_LABELS[event.event_type]}
          color={EVENT_BADGE_COLORS[event.event_type]}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {formatLocalDateTime(event.occurred_at)}
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
      {editingInline ? (
        <InlineEditForm
          applicationId={applicationId}
          event={event}
          onCancel={onCancelEdit}
          onSaved={onSaved}
        />
      ) : (
        <>
          <InterviewBlock event={event} />
          <NoteBlock note={event.note} />
        </>
      )}
      <SourceBlock source={event.source} />
    </li>
  );
}
