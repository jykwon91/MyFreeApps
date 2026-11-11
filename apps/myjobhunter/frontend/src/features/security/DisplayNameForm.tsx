import { useId, useState } from "react";
import { DISPLAY_NAME_MAX_LENGTH } from "@myjobhunter/api-client/constants/textFieldLimits";
import { tooLongProblem } from "@myjobhunter/api-client/utils/tooLongProblem";
import { characterCounter } from "@myjobhunter/api-client/utils/characterCounter";
import { FieldFeedback, fieldFeedbackAria, showError, showSuccess } from "@platform/ui";
import { useUpdateCurrentUserMutation } from "@platform/ui/store/userApi";

export interface DisplayNameFormProps {
  initialName: string;
  disabled?: boolean;
}

export default function DisplayNameForm({ initialName, disabled = false }: DisplayNameFormProps) {
  const [updateCurrentUser, { isLoading: isSaving }] = useUpdateCurrentUserMutation();
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);

  async function handleSave() {
    try {
      const trimmed = name.trim();
      await updateCurrentUser({ display_name: trimmed }).unwrap();
      setSavedName(trimmed);
      showSuccess("Display name saved.");
    } catch {
      showError("Couldn't save your name. Try again.");
    }
  }

  const dirty = name.trim() !== savedName;
  const nameProblem = tooLongProblem(name.trim(), DISPLAY_NAME_MAX_LENGTH);
  const inputId = useId();
  const feedback = { id: inputId, error: nameProblem, counter: characterCounter(name.trim(), DISPLAY_NAME_MAX_LENGTH) };

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="sr-only">
        Display name
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id={inputId}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jane Smith"
          disabled={disabled}
          {...fieldFeedbackAria(feedback)}
          className="flex-1 px-3 py-2 text-sm border rounded-md disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={disabled || isSaving || !dirty || nameProblem !== undefined}
          className="px-3 py-2 text-sm font-medium rounded-md border bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 min-h-[44px] sm:min-h-[36px]"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
      <FieldFeedback {...feedback} />
    </div>
  );
}
