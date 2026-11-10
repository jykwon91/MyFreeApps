import { useDeleteLeaseTemplateMutation } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import { useToast } from "@platform/mobile";
import { LEASE_TEMPLATE_DELETE_COPY } from "../../constants/leaseTemplateFailures";
import { LEASE_TEMPLATE_MESSAGES } from "../../constants/leaseTemplates";
import { useLeaseTemplateWrite } from "../../lib/useLeaseTemplateWrite";

/** Deletes a template and leaves its screen. One that was already deleted counts as done. */
export function useDeleteLeaseTemplate(templateId: string, onDeleted: () => void) {
  const { showToast } = useToast();
  const [deleteTemplate] = useDeleteLeaseTemplateMutation();
  const write = useLeaseTemplateWrite(LEASE_TEMPLATE_DELETE_COPY);

  async function remove(): Promise<void> {
    const result = await write.run(() => deleteTemplate(templateId).unwrap(), { staysLocked: true });
    if (result !== "done" && result !== "gone") return;
    onDeleted();
    showToast(result === "done" ? LEASE_TEMPLATE_MESSAGES.deleted : LEASE_TEMPLATE_MESSAGES.alreadyDeleted);
  }

  return { remove, isDeleting: write.isBusy, message: write.message };
}
