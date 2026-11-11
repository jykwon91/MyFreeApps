import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X } from "lucide-react";
import { useLogApplicationEventMutation } from "@myjobhunter/api-client/store/applicationsApi";
import { INTERVIEW_EVENT_TYPES } from "@myjobhunter/api-client/constants/interviewEventTypes";
import { LOGGABLE_EVENT_TYPES } from "@myjobhunter/api-client/constants/loggableEventTypes";
import type { LogEventFormValues } from "@myjobhunter/api-client/types/log-event-form-values";
import { emptyFormValues } from "@myjobhunter/api-client/utils/interviewEventForm";
import { formatEventType } from "@myjobhunter/api-client/utils/formatEventType";
import { logEventRequest } from "@myjobhunter/api-client/utils/logEventRequest";
import EventNoteField from "@/features/applications/EventNoteField";
import InterviewDetailsFields from "./InterviewDetailsFields";

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
      await logEvent({ applicationId, body: logEventRequest(values) }).unwrap();
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
                {LOGGABLE_EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>{formatEventType(type)}</option>
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
              <InterviewDetailsFields register={register} errors={errors} watch={watch} />
            ) : null}

            <EventNoteField id="log-event-note" register={register} errors={errors} watch={watch} />

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
