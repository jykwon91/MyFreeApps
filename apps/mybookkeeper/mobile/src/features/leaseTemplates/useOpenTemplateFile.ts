import { useLazyGetLeaseTemplateByIdQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import type { LeaseTemplateFile } from "@mybookkeeper/api-client/types/lease/lease-template-file";
import { LEASE_TEMPLATE_MESSAGES } from "../../constants/leaseTemplates";
import { useOpenFreshAttachment } from "../documents/useOpenFreshAttachment";

export function useOpenTemplateFile(templateId: string): {
  openingId: string | null;
  open: (file: LeaseTemplateFile) => Promise<void>;
} {
  const [fetchTemplate] = useLazyGetLeaseTemplateByIdQuery();
  return useOpenFreshAttachment<LeaseTemplateFile>(
    async () => (await fetchTemplate(templateId).unwrap()).files,
    LEASE_TEMPLATE_MESSAGES.couldntOpen,
  );
}
