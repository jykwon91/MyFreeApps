import { FieldFeedback, fieldFeedbackAria } from "@platform/ui";
import type { FieldErrors, UseFormRegister, UseFormWatch } from "react-hook-form";
import { EVENT_NOTE_MAX_LENGTH } from "@myjobhunter/api-client/constants/textFieldLimits";
import type { LogEventFormValues } from "@myjobhunter/api-client/types/log-event-form-values";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";

interface EventNoteFieldProps {
  id: string;
  register: UseFormRegister<LogEventFormValues>;
  errors: FieldErrors<LogEventFormValues>;
  watch: UseFormWatch<LogEventFormValues>;
}

/**
 * The note on an event. No `maxLength`: a pasted note over the backend's limit would be cut
 * silently, so the form says how far over it is and won't save it instead.
 */
export default function EventNoteField({ id, register, errors, watch }: EventNoteFieldProps) {
  const feedback = { id, error: errors.note?.message, counter: characterCounter(watch("note").trim(), EVENT_NOTE_MAX_LENGTH) };
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1">
        Note
      </label>
      <textarea
        id={id}
        {...fieldFeedbackAria(feedback)}
        {...register("note", { validate: (value) => tooLongProblem(value.trim(), EVENT_NOTE_MAX_LENGTH) ?? true })}
        rows={3}
        className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        placeholder="Anything to remember about this event..."
      />
      <FieldFeedback {...feedback} />
    </div>
  );
}
