import { attributionSourceLabel } from "@mybookkeeper/api-client/constants/attributionLabels";
import { useGetApplicantByIdQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { LoadingButton } from "@platform/mobile";
import { useRef, useState } from "react";
import { TENANT_LINK_MESSAGES as MESSAGES } from "../../constants/transactionTenantLink";
import TenantPickerSheet from "../tenants/TenantPickerSheet";
import TransactionFact from "./TransactionFact";
import { useAttributeTenant } from "./useAttributeTenant";

interface TransactionTenantLinkProps {
  transaction: Transaction;
  canWrite: boolean;
}

/** Who paid an income transaction, with a way to change it for people who can write. */
export default function TransactionTenantLink({ transaction, canWrite }: TransactionTenantLinkProps) {
  const linkedId = transaction.applicant_id;
  const { data: tenant } = useGetApplicantByIdQuery(linkedId ?? "", { skip: !linkedId });
  const { isLinking, askToLink } = useAttributeTenant(transaction.id);
  // A sheet loads its list when it first mounts, so a transaction nobody links loads nothing.
  const [hasOpenedSheet, setHasOpenedSheet] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const picked = useRef<{ id: string; name: string } | null>(null);

  if (!linkedId && !canWrite) return null;

  const source = transaction.attribution_source ? ` (${attributionSourceLabel(transaction.attribution_source)})` : "";
  const value = linkedId ? `${MESSAGES.linkedTo} ${tenant?.legal_name ?? MESSAGES.thisTenant}${source}` : MESSAGES.notLinked;

  function pick(choice: { id: string; name: string }): void {
    picked.current = choice;
    setIsPicking(false);
  }

  // An Alert raised while the sheet is still closing can be lost on iOS.
  function actOnPick(): void {
    const choice = picked.current;
    picked.current = null;
    if (choice) askToLink(choice);
  }

  return (
    <>
      <TransactionFact label={MESSAGES.heading} value={value} />
      {canWrite ? (
        <LoadingButton
          disabled={isLinking}
          isLoading={isLinking}
          loadingText={MESSAGES.linking}
          onPress={() => {
            setHasOpenedSheet(true);
            setIsPicking(true);
          }}
          variant="secondary"
        >
          {linkedId ? MESSAGES.relink : MESSAGES.link}
        </LoadingButton>
      ) : null}
      {hasOpenedSheet ? (
        <TenantPickerSheet
          description={MESSAGES.pickerDescription}
          isOpen={isPicking}
          onClose={() => setIsPicking(false)}
          onClosed={actOnPick}
          onPick={pick}
        />
      ) : null}
    </>
  );
}
