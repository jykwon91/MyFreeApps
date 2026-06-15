import { useState } from "react";
import { showError, showSuccess } from "@platform/ui";
import { useUpdateCurrentUserMutation } from "@/lib/userApi";

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
      await updateCurrentUser({ display_name: trimmed || null }).unwrap();
      setSavedName(trimmed);
      showSuccess("Display name saved.");
    } catch {
      showError("Couldn't save your name. Try again.");
    }
  }

  const dirty = name.trim() !== savedName;

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Jane Smith"
        disabled={disabled}
        className="flex-1 px-3 py-2 text-sm border rounded-md disabled:opacity-50"
        maxLength={100}
      />
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={disabled || isSaving || !dirty}
        className="px-3 py-2 text-sm font-medium rounded-md border bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 min-h-[44px] sm:min-h-[36px]"
      >
        {isSaving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
