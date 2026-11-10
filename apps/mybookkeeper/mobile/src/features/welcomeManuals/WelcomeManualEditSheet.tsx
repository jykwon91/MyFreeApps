import { FormSheet, LoadingButton } from "@platform/mobile";
import { useRef, type ReactNode } from "react";
import { askOnce } from "../../lib/askOnce";
import { confirmDiscard } from "../uploads/confirmDiscard";

interface WelcomeManualEditSheetProps {
  title: string;
  failure: string | null;
  isBusy: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  isDirty: boolean;
  isNew: boolean;
  /** Labels for the buttons, in the sentence form for this kind of item. */
  labels: { add: string; adding: string; save: string; saving: string; delete: string; deleting: string; cancel: string };
  /** Asked before deleting. Without it there is no delete button (a new item has nothing to delete). */
  confirmDelete?: { title: string; body: string };
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
  children: ReactNode;
}

/** The sheet every small item of a manual (field, room, place, caption) is added or changed in. */
export default function WelcomeManualEditSheet({ title, failure, isBusy, isSaving, isDeleting, isDirty, isNew, labels, confirmDelete, onSave, onDelete, onClose, children }: WelcomeManualEditSheetProps) {
  const asking = useRef(false);

  function close(): void {
    if (isBusy) return;
    if (isDirty) confirmDiscard(onClose);
    else onClose();
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={close} title={title}>
      {children}
      <LoadingButton disabled={isBusy} isLoading={isSaving} loadingText={isNew ? labels.adding : labels.saving} onPress={onSave}>
        {isNew ? labels.add : labels.save}
      </LoadingButton>
      {!isNew && confirmDelete ? (
        <LoadingButton
          disabled={isBusy}
          isLoading={isDeleting}
          loadingText={labels.deleting}
          onPress={() => askOnce(asking, confirmDelete.title, confirmDelete.body, { text: labels.delete, style: "destructive", onPress: onDelete })}
          variant="destructive"
        >
          {labels.delete}
        </LoadingButton>
      ) : null}
      <LoadingButton disabled={isBusy} onPress={close} variant="ghost">
        {labels.cancel}
      </LoadingButton>
    </FormSheet>
  );
}
