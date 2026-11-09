import { useAttributeTransactionManuallyMutation } from "@mybookkeeper/api-client/store/attributionApi";
import { useToast } from "@platform/mobile";
import { useRef } from "react";
import { TENANT_LINK_FAILURE, TENANT_LINK_MESSAGES as MESSAGES } from "../../constants/transactionTenantLink";
import type { TenantChoice } from "../../types/TenantChoice";
import { useWrite } from "../../lib/useWrite";
import { askOnce } from "../../lib/askOnce";

/** Links one income transaction to a tenant, after asking once. */
export function useAttributeTenant(transactionId: string) {
  const { showToast } = useToast();
  const [attribute] = useAttributeTransactionManuallyMutation();
  const write = useWrite();
  const asking = useRef(false);

  async function link(tenant: TenantChoice): Promise<void> {
    const result = await write.run(() => attribute({ transaction_id: transactionId, applicant_id: tenant.id }).unwrap());
    if (result === "done") showToast(`${MESSAGES.linked} ${tenant.name}.`);
    else if (result !== "busy") showToast(TENANT_LINK_FAILURE[result], "error");
  }

  function askToLink(tenant: TenantChoice): void {
    if (write.isBusy) return;
    askOnce(asking, `${MESSAGES.confirmAction} ${tenant.name}?`, MESSAGES.confirmBody, {
      text: MESSAGES.confirmAction,
      onPress: () => void link(tenant),
    });
  }

  return { isLinking: write.isBusy, askToLink };
}
