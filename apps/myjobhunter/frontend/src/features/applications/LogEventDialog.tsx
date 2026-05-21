import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X } from "lucide-react";
import {
  useLogApplicationEventMutation,
  useUpdateApplicationEventMutation,
} from "@/lib/applicationsApi";
import type { ApplicationEvent, ApplicationEventType } from "@/types/application-event";
import type {
  InterviewType,
  InterviewDetails,
} from "@/types/interview-details";
import InterviewDetailsFields from "./InterviewDetailsFields";

const EVENT_TYPE_OPTIONS: { value: ApplicationEventType; label: string }[] = [
  { value: "applied", label: "Applied" },
  { value: "interview_scheduled", label: "Interview scheduled" },
  { value: "interview_completed", label: "Interview completed" },
  { value: "offer_received", label: "Offer received" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "ghosted", label: "Ghosted" },
  { value: "note_added", label: "Note added" },
  { value: "follow_up_sent", label: "Follow-up sent" },
  // `email_received` intentionally omitted from manual logging — that's
  // the Gmail sync worker's lane.
];

const INTERVIEW_EVENT_TYPES = new Set<ApplicationEventType>([
  "interview_scheduled",
  "interview_completed",
]);

export interface LogEventFormValues {
  event_type: ApplicationEventType;
  occurred_at: string;
  note: string;
  // Interview sub-form. Empty strings = "not set"; only sent to the API
  // when event_type is an interview type AND interview_type is non-empty.
  interview_type: InterviewType | "";
  interview_scheduled_at: string;
  interview_duration_minutes: string;
  interview_location_or_link: string;
  interview_interviewer_names: string;
}

function defaultOccurredAt(): string {
  // datetime-local input expects YYYY-MM-DDTHH:mm without timezone.
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60_000;
  const local = new Date(now.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 16);
}

function emptyFormValues(): LogEventFormValues {
  return {
    event_type: "applied",
    occurred_at: defaultOccurredAt(),
    note: "",
    interview_type: "",
    interview_scheduled_at: "",
    interview_duration_minutes: "",
    interview_location_or_link: "",
    interview_interviewer_names: "",
  };
}

function isoToDatetimeLocalInput(iso: string | null | undefined): string {
  // Convert ISO string from backend to the `datetime-local` input's
  // expected YYYY-MM-DDTHH:mm format in the user's local time.
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tzOffsetMs = d.getTimezoneOffset() * 60_000;
  const local = new Date(d.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 16);
}

function eventToFormValues(event: ApplicationEvent): LogEventFormValues {
  const details = event.interview_details;
  return {
    event_type: event.event_type,
    occurred_at: isoToDatetimeLocalInput(event.occurred_at),
    note: event.note ?? "",
    interview_type: (details?.type as InterviewType) ?? "",
    interview_scheduled_at: isoToDatetimeLocalInput(details?.scheduled_at),
    interview_duration_minutes:
      details?.duration_minutes != null ? String(details.duration_minutes) : "",
    interview_location_or_link: details?.location_or_link ?? "",
    interview_interviewer_names: (details?.interviewer_names ?? []).join("\n"),
  };
}

function buildInterviewDetails(values: LogEventFormValues): InterviewDetails | null {
  if (!values.interview_type) return null;

  const names = values.interview_interviewer_names
    .split("\n")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  const details: InterviewDetails = { type: values.interview_type };
  if (values.interview_scheduled_at) {
    details.scheduled_at = new Date(values.interview_scheduled_at).toISOString();
  }
  if (values.interview_duration_minutes) {
    const n = Number(values.interview_duration_minutes);
    if (Number.isFinite(n) && n > 0) details.duration_minutes = n;
  }
  if (values.interview_location_or_link.trim()) {
    details.location_or_link = values.interview_location_or_link.trim();
  }
  if (names.length > 0) {
    details.interviewer_names = names;
  }
  return details;
}

export type LogEventDialogMode = "create" | "edit";

export interface LogEventDialogProps {
  applicationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: LogEventDialogMode;
  /**
   * The event to edit when `mode === "edit"`. Ignored in create mode.
   * Must be an `interview_scheduled` or `interview_completed` event —
   * the backend will return 422 for any other type.
   */
  eventToEdit?: ApplicationEvent | null;
}

export default function LogEventDialog({
  applicationId,
  open,
  onOpenChange,
  mode = "create",
  eventToEdit = null,
}: LogEventDialogProps) {
  const isEdit = mode === "edit" && eventToEdit !== null;
  const [logEvent, { isLoading: isLogging }] = useLogApplicationEventMutation();
  const [updateEvent, { isLoading: isUpdating }] = useUpdateApplicationEventMutation();
  const isLoading = isEdit ? isUpdating : isLogging;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<LogEventFormValues>({
    defaultValues: emptyFormValues(),
  });

  const eventType = watch("event_type");
  // In edit mode the dialog only ever opens for interview events, so the
  // interview fields always show. In create mode they show only when the
  // selected event_type calls for them.
  const showInterviewFields = isEdit || INTERVIEW_EVENT_TYPES.has(eventType);

  useEffect(() => {
    if (!open) return;
    if (isEdit && eventToEdit) {
      reset(eventToFormValues(eventToEdit));
    } else {
      reset(emptyFormValues());
    }
  }, [open, isEdit, eventToEdit, reset]);

  const onSubmit: SubmitHandler<LogEventFormValues> = async (values) => {
    try {
      if (isEdit && eventToEdit) {
        await updateEvent({
          applicationId,
          eventId: eventToEdit.id,
          body: {
            interview_details: buildInterviewDetails(values),
            note: values.note.trim() || null,
          },
        }).unwrap();
        showSuccess("Interview details updated");
      } else {
        // datetime-local is naive; promote to UTC ISO so the backend stores
        // a tz-aware datetime.
        const occurredIso = new Date(values.occurred_at).toISOString();
        await logEvent({
          applicationId,
          body: {
            event_type: values.event_type,
            occurred_at: occurredIso,
            source: "manual",
            note: values.note.trim() || null,
            interview_details: INTERVIEW_EVENT_TYPES.has(values.event_type)
              ? buildInterviewDetails(values)
              : null,
          },
        }).unwrap();
        showSuccess("Event logged");
      }
      onOpenChange(false);
    } catch (err) {
      const verb = isEdit ? "update" : "log";
      showError(`Couldn't ${verb} event: ${extractErrorMessage(err)}`);
    }
  };

  const title = isEdit ? "Edit interview details" : "Log event";
  const submitLabel = isEdit ? "Save changes" : "Log event";
  const loadingLabel = isEdit ? "Saving..." : "Logging...";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md max-h-[90vh] overflow-y-auto bg-card border rounded-lg shadow-lg z-50 p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {isEdit ? null : (
              <>
                <div>
                  <label htmlFor="log-event-type" className="block text-sm font-medium mb-1">
                    Event <span className="text-destructive">*</span>
                  </label>
                  <select
                    id="log-event-type"
                    {...register("event_type", { required: true })}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  >
                    {EVENT_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="log-event-when" className="block text-sm font-medium mb-1">
                    When <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="log-event-when"
                    type="datetime-local"
                    {...register("occurred_at", { required: "Date is required" })}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  />
                  {errors.occurred_at ? (
                    <p className="text-xs text-destructive mt-1">{errors.occurred_at.message}</p>
                  ) : null}
                </div>
              </>
            )}

            {showInterviewFields ? (
              <InterviewDetailsFields register={register} errors={errors} />
            ) : null}

            <div>
              <label htmlFor="log-event-note" className="block text-sm font-medium mb-1">Note</label>
              <textarea
                id="log-event-note"
                {...register("note")}
                rows={3}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                placeholder="Anything to remember about this event..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <LoadingButton type="submit" isLoading={isLoading} loadingText={loadingLabel}>
                {submitLabel}
              </LoadingButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
