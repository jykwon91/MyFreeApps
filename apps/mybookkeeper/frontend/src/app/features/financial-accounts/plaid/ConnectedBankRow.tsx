import { useState } from "react";
import { Button, ConfirmDialog, LoadingButton, showError, showSuccess } from "@platform/ui";
import { PLAID_INVESTMENTS_STATUS_CONSENT_REQUIRED, PLAID_ITEM_STATUS_ACTIVE } from "@mybookkeeper/api-client/constants/plaidItemStatuses";
import { useDisconnectPlaidItemMutation, useSyncPlaidItemMutation } from "@mybookkeeper/api-client/store/plaidApi";
import type { PlaidItem } from "@mybookkeeper/api-client/types/plaid/plaid-item";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { describeSyncChanges } from "@mybookkeeper/api-client/utils/plaidItemFormat";
import { PLAID_MESSAGES as MSG } from "@/shared/lib/plaid-messages";
import { plaidInvestmentsNote } from "@/shared/lib/plaidInvestmentsNote";
import { plaidItemStatusNote } from "@/shared/lib/plaidItemStatusNote";

const CONFLICT = 409;

export interface ConnectedBankRowProps {
  item: PlaidItem;
  onReconnect: (itemId: string) => void;
  onAddInvestments: (itemId: string) => void;
  /** Link is being opened for this connection (Reconnect or Add investments). */
  isReconnecting: boolean;
}

/**
 * One bank connection: its health, Sync now (or Reconnect when the bank wants a
 * sign-in), Add investments when the bank holds some it hasn't shared yet, and Disconnect.
 */
export default function ConnectedBankRow({ item, onReconnect, onAddInvestments, isReconnecting }: ConnectedBankRowProps) {
  const [syncItem, { isLoading: isSyncing }] = useSyncPlaidItemMutation();
  const [disconnectItem, { isLoading: isDisconnecting }] = useDisconnectPlaidItemMutation();
  const [confirming, setConfirming] = useState(false);
  const isActive = item.status === PLAID_ITEM_STATUS_ACTIVE;
  const canAddInvestments = isActive && item.investments_status === PLAID_INVESTMENTS_STATUS_CONSENT_REQUIRED;
  const investmentsNote = plaidInvestmentsNote(item);

  async function handleSync() {
    try {
      const result = await syncItem(item.id).unwrap();
      if (result.status === PLAID_ITEM_STATUS_ACTIVE) showSuccess(MSG.synced(describeSyncChanges(result)));
      else showError(MSG.needsSignIn);
    } catch (err) {
      showError(httpStatus(err) === CONFLICT ? MSG.needsSignIn : MSG.syncFailed);
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectItem(item.id).unwrap();
      setConfirming(false);
      showSuccess(MSG.disconnected);
    } catch {
      showError(MSG.disconnectFailed);
    }
  }

  return (
    <li className="border rounded-lg px-4 py-3 text-sm" data-testid={`connected-bank-row-${item.id}`}>
      <p className="font-medium truncate" data-testid="connected-bank-name">{item.institution_name ?? MSG.unknownBank}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{MSG.accountCount(item.account_count)}</p>
      <p className={isActive ? "text-xs text-muted-foreground mt-0.5" : "text-xs text-destructive mt-0.5"} data-testid="connected-bank-status">
        {plaidItemStatusNote(item)}
      </p>
      {investmentsNote ? (
        <p className="text-xs text-muted-foreground mt-0.5" data-testid="connected-bank-investments">{investmentsNote}</p>
      ) : null}
      <div className="flex flex-wrap gap-2 mt-2">
        {isActive ? (
          <LoadingButton
            type="button" variant="secondary" size="sm" className="min-h-[44px]"
            isLoading={isSyncing} loadingText={MSG.syncing}
            onClick={() => void handleSync()} data-testid="connected-bank-sync"
          >
            {MSG.syncNow}
          </LoadingButton>
        ) : (
          <LoadingButton
            type="button" variant="primary" size="sm" className="min-h-[44px]"
            isLoading={isReconnecting} loadingText={MSG.connecting}
            onClick={() => onReconnect(item.id)} data-testid="connected-bank-reconnect"
          >
            {MSG.reconnect}
          </LoadingButton>
        )}
        {canAddInvestments ? (
          <LoadingButton
            type="button" variant="primary" size="sm" className="min-h-[44px]"
            isLoading={isReconnecting} loadingText={MSG.connecting}
            onClick={() => onAddInvestments(item.id)} data-testid="connected-bank-add-investments"
          >
            {MSG.addInvestments}
          </LoadingButton>
        ) : null}
        <Button
          type="button" variant="secondary" size="sm" className="min-h-[44px]"
          onClick={() => setConfirming(true)} data-testid="connected-bank-disconnect"
        >
          {MSG.disconnect}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={MSG.disconnectTitle}
        description={MSG.disconnectDescription}
        confirmLabel={MSG.disconnect}
        variant="destructive"
        isLoading={isDisconnecting}
        onConfirm={() => void handleDisconnect()}
        onCancel={() => setConfirming(false)}
      />
    </li>
  );
}
