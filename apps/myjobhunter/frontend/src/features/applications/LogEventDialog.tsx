import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X } from "lucide-react";
import { useLogApplicationEventMutation } from "@/lib/applicationsApi";
import type { ApplicationEventType } from "@/types/application-event";
import InterviewDetailsFields from "./InterviewDetailsFields";
import {
  buildInterviewDetails,
  emptyFormValues,
  type LogEventFormValues,
} from "./interviewEventForm";

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

export interface LogEventDialogProps {
  applicationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function LogEventDialog({
  applicationId,
  open,
  onOpenChange,
}: LogEventDialogProps) {
  const [logEvent, { isLoading }] = useLogApplicationEventMutation();

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
  const showInterviewFields = INTERVIEW_EVENT_TYPES.has(eventType);

  useEffect(() => {
    if (!open) return;
    reset(emptyFormValues());
  }, [open, reset]);

  const onSubmit: SubmitHandler<LogEventFormValues> = async (values) => {
    try {
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
      onOpenChange(false);
    } catch (err) {
      showError(`Couldn't log event: ${extractErrorMessage(err)}`);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md max-h-[90vh] overflow-y-auto bg-card border rounded-lg shadow-lg z-50 p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">Log event</Dialog.Title>
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
              <LoadingButton type="submit" isLoading={isLoading} loadingText="Logging...">
                Log event
              </LoadingButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
