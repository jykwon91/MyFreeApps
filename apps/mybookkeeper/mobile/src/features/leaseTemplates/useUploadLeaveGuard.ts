import { confirmDiscard, useConfirmLeave, useToast } from "@platform/mobile";
import { LEASE_TEMPLATE_FORM_MESSAGES } from "../../constants/leaseTemplateForm";
import type { UploadLeaveGuardArgs } from "../../types/UploadLeaveGuardArgs";

/**
 * What going back means on the upload screen, by how far it has got: nothing sent asks before discarding;
 * the upload in flight says so; and once the template is saved (the AI is only reading it) back opens it.
 */
export function useUploadLeaveGuard({ isDirty, isUploading, isReading, isLeaving, openNow }: UploadLeaveGuardArgs): void {
  const { showToast } = useToast();
  useConfirmLeave((isDirty || isUploading || isReading) && !isLeaving, (leave) => {
    if (isReading) {
      openNow();
      return;
    }
    if (isUploading) {
      showToast(LEASE_TEMPLATE_FORM_MESSAGES.stillUploading);
      return;
    }
    confirmDiscard(leave);
  });
}
