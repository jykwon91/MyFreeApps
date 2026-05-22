import { useEffect } from "react";
import { Badge, LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { Pencil } from "lucide-react";
import { useForm, type SubmitHandler } from "react-hook-form";
import InterviewDetailsSummary from "@/features/applications/InterviewDetailsSummary";
import InterviewDetailsFields from "@/features/applications/InterviewDetailsFields";
import {
  buildInterviewDetails,
  eventToFormValues,
  type LogEventFormValues,
} from "@/features/applications/interviewEventForm";
import { useUpdateApplicationEventMutation } from "@/lib/applicationsApi";
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

interface InlineEditFormProps {
  applicationId: string;
  event: ApplicationEvent;
  onCancel: () => void;
  onSaved: () => void;
}

function InlineEditForm({
  applicationId,
  event,
  onCancel,
  onSaved,
}: InlineEditFormProps) {
  const [updateEvent, { isLoading: isSaving }] = useUpdateApplicationEventMutation();
  const idPrefix = `inline-edit-${event.id}`;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LogEventFormValues>({
    defaultValues: eventToFormValues(event),
  });

  useEffect(() => {
    // Move keyboard focus into the form so the user can type immediately
    // after pressing pencil. The Type select carries the focus per spec.
    document.getElementById(`${idPrefix}-type`)?.focus();
  }, [idPrefix]);

  const onSubmit: SubmitHandler<LogEventFormValues> = async (values) => {
    try {
      await updateEvent({
        applicationId,
        eventId: event.id,
        body: {
          interview_details: buildInterviewDetails(values),
          note: values.note.trim() || null,
        },
      }).unwrap();
      showSuccess("Interview details updated");
      onSaved();
    } catch (err) {
      showError(`Couldn't save: ${extractErrorMessage(err)}`);
    }
  };

  function handleKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Escape" && !isSaving) {
      e.preventDefault();
      onCancel();
    }
  }

  const noteFieldId = `${idPrefix}-note`;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      onKeyDown={handleKeyDown}
      className="mt-2 space-y-3"
      noValidate
    >
      <InterviewDetailsFields
        register={register}
        errors={errors}
        stackedLayout
        idPrefix={idPrefix}
      />

      <div>
        <label htmlFor={noteFieldId} className="block text-sm font-medium mb-1">
          Note
        </label>
        <textarea
          id={noteFieldId}
          {...register("note")}
          rows={3}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          placeholder="Anything to remember about this event..."
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="px-3 py-2 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <LoadingButton
          type="submit"
          isLoading={isSaving}
          loadingText="Saving..."
        >
          Save changes
        </LoadingButton>
      </div>
    </form>
  );
}

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
