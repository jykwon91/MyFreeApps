import { DOCUMENT_TITLE_MAX_LENGTH } from "@myjobhunter/api-client/constants/documentFieldLimits";
import { characterCounter } from "@myjobhunter/api-client/utils/characterCounter";
import { FieldFeedback, fieldFeedbackAria } from "@platform/ui";

interface DocumentTitleFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Why the title can't be saved yet. No `maxLength`: a pasted title would be cut silently. */
  error: string | undefined;
  placeholder?: string;
}

/** A document's title, shared by the add and edit dialogs. */
export default function DocumentTitleField({ id, value, onChange, error, placeholder }: DocumentTitleFieldProps) {
  const feedback = { id, error, counter: characterCounter(value, DOCUMENT_TITLE_MAX_LENGTH) };
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium" htmlFor={id}>
        Title
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        placeholder={placeholder}
        {...fieldFeedbackAria(feedback)}
        className="w-full border rounded-md px-3 py-2 text-sm bg-background"
      />
      <FieldFeedback {...feedback} />
    </div>
  );
}
