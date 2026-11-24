import type { PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import type { PlaidPendingConnection } from "@mybookkeeper/api-client/types/plaid/plaid-pending-connection";

/** What Link returned, reduced to what MBK keeps before the person confirms. */
export function toPendingConnection(publicToken: string, metadata: PlaidLinkOnSuccessMetadata): PlaidPendingConnection {
  return {
    publicToken,
    institutionId: metadata.institution?.institution_id ?? null,
    institutionName: metadata.institution?.name ?? null,
    accounts: metadata.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      mask: account.mask,
      type: account.type,
      subtype: account.subtype || null,
    })),
  };
}
