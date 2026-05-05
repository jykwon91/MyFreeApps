import { useState } from "react";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useUpdateInquiryMutation } from "@/shared/store/inquiriesApi";

export interface InquiryNotesEditorProps {
  inquiryId: string;
  initialNotes: string | null;
}

/**
 * Auto-saving notes textarea.
 *
 * Saves on blur when the value differs from ``initialNotes`` — never on every
 * keystroke (which would amplify network chatter and re-render storms).
 * Toast surfaces the result so the host gets visible confirmation per
 * ``feedback_ux`` ("provide visible feedback for every user action").
 *
 * If save fails the local edited value is preserved so the host doesn't lose
 * their text — a retry on a subsequent blur will re-attempt with the current
 * value.
 */
const SAVED_TOAST = "Notes saved.";
const ERROR_TOAST = "I couldn't save those notes. Want to try again?";

export default function InquiryNotesEditor({ inquiryId, initialNotes }: InquiryNotesEditorProps) {
  const [value, setValue] = useState(initialNotes ?? "");
  const [savedValue, setSavedValue] = useState(initialNotes ?? "");
  const [updateInquiry, { isLoading }] = useUpdateInquiryMutation();

  async function handleBlur() {
    const trimmed = value.trim();
    if (trimmed === savedValue.trim()) return;
    try {
      await updateInquiry({
        id: inquiryId,
        data: { notes: trimmed.length > 0 ? trimmed : null },
      }).unwrap();
      setSavedValue(trimmed);
      showSuccess(SAVED_TOAST);
    } catch {
      showError(ERROR_TOAST);
    }
  }

  return (
    <textarea
      data-testid="inquiry-notes-editor"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void handleBlur()}
      disabled={isLoading}
      rows={4}
      placeholder="Anything you want to remember about this inquiry — quirks, follow-ups, gut take."
      className="w-full border rounded-md px-3 py-2 text-sm resize-y disabled:opacity-50"
    />
  );
}
