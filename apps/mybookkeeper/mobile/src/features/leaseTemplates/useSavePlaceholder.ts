import { useUpdateLeasePlaceholderMutation } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import type { LeasePlaceholderFormValues } from "@mybookkeeper/api-client/types/lease/lease-placeholder-form-values";
import { placeholderDirtyFields, placeholderUpdateRequest } from "@mybookkeeper/api-client/utils/leasePlaceholderForm";
import { useToast } from "@platform/mobile";
import { PLACEHOLDER_MESSAGES } from "../../constants/leasePlaceholderEdit";
import { PLACEHOLDER_SAVE_COPY } from "../../constants/leaseTemplateFailures";
import { useLeaseTemplateWrite } from "../../lib/useLeaseTemplateWrite";
import { useLeaveWhenSaved } from "../../lib/useLeaveWhenSaved";

/** Saves only what changed from `started` on one placeholder, and goes back when it's done. */
export function useSavePlaceholder(templateId: string, placeholderId: string, started: LeasePlaceholderFormValues) {
  const { showToast } = useToast();
  const [updatePlaceholder] = useUpdateLeasePlaceholderMutation();
  const write = useLeaseTemplateWrite(PLACEHOLDER_SAVE_COPY);
  const { isLeaving, leave } = useLeaveWhenSaved(`/lease-templates/${templateId}`);

  async function submit(values: LeasePlaceholderFormValues): Promise<void> {
    const dirty = placeholderDirtyFields(values, started);
    if (dirty.length === 0) {
      leave();
      return;
    }
    const result = await write.run(() => updatePlaceholder({ templateId, placeholderId, data: placeholderUpdateRequest(values, dirty) }).unwrap(), { staysLocked: true });
    if (result !== "done") return;
    showToast(PLACEHOLDER_MESSAGES.saved);
    leave();
  }

  return { submit, isBusy: write.isBusy, isLeaving, message: write.message };
}
