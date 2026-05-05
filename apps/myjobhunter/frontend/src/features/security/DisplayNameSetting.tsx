import { useEffect, useState } from "react";
import { showError, showSuccess } from "@platform/ui";
import { useGetCurrentUserQuery, useUpdateCurrentUserMutation } from "@/lib/userApi";

/**
 * Lets the user set the display name shown in their profile and on exported
 * data. Without this, the app falls back to the email local-part.
 */
export default function DisplayNameSetting() {
  const { data: currentUser, isLoading } = useGetCurrentUserQuery();
  const [updateCurrentUser, { isLoading: isSaving }] = useUpdateCurrentUserMutation();

  const [name, setName] = useState("");
  const [originalName, setOriginalName] = useState("");

  useEffect(() => {
    if (currentUser) {
      const current = currentUser.display_name ?? "";
      setName(current);
      setOriginalName(current);
    }
  }, [currentUser]);

  async function handleSave() {
    try {
      const trimmed = name.trim();
      await updateCurrentUser({ display_name: trimmed || null }).unwrap();
      setOriginalName(trimmed);
      showSuccess("Display name saved.");
    } catch {
      showError("Couldn't save your name. Try again.");
    }
  }

  const dirty = name.trim() !== originalName;

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">Display name</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Shown in your profile and on exported data. Use the name you want
          employers and contacts to see.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jane Smith"
          disabled={isLoading}
          className="flex-1 px-3 py-2 text-sm border rounded-md disabled:opacity-50"
          maxLength={100}
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isLoading || isSaving || !dirty}
          className="px-3 py-2 text-sm font-medium rounded-md border bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 min-h-[44px] sm:min-h-[36px]"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
