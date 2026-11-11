import { useEffect } from "react";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { useForm, type SubmitHandler } from "react-hook-form";
import EventNoteField from "@/features/applications/EventNoteField";
import InterviewDetailsFields from "@/features/applications/InterviewDetailsFields";
import type { LogEventFormValues } from "@myjobhunter/api-client/types/log-event-form-values";
import { eventToFormValues } from "@myjobhunter/api-client/utils/interviewEventForm";
import { interviewEventUpdateRequest } from "@myjobhunter/api-client/utils/interviewEventUpdateRequest";
import { useUpdateApplicationEventMutation } from "@myjobhunter/api-client/store/applicationsApi";
import type { ApplicationEvent } from "@myjobhunter/api-client/types/application-event";

/** The inline edit of an interview event's details and note, in place on its card. */
interface InlineEditFormProps {
  applicationId: string;
  event: ApplicationEvent;
  onCancel: () => void;
  onSaved: () => void;
}

export default function InlineEditForm({
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
    watch,
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
        body: interviewEventUpdateRequest(values),
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
        watch={watch}
        stackedLayout
        idPrefix={idPrefix}
      />

      <EventNoteField id={noteFieldId} register={register} errors={errors} watch={watch} />

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
