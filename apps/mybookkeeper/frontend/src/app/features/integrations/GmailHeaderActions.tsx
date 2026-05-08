import { useState } from "react";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import type { Integration } from "@/shared/types/integration/integration";

export interface GmailHeaderActionsProps {
  gmail: Integration | undefined;
  isConnecting: boolean;
  isSyncing: boolean;
  isSyncStarting: boolean;
  isCancelling: boolean;
  isDisconnecting: boolean;
  latestSyncLogId: number | null;
  onConnect: () => void;
  onSync: () => void;
  onCancel: (syncLogId?: number) => void;
  onDisconnect: () => void;
}

/**
 * Renders the Sync / Cancel / Disconnect / Connect / Reconnect button group
 * to the right of the Gmail header. Branches by Integration state via early
 * returns rather than nested ternaries; sub-state for the inline "Are you
 * sure?" confirms is local to this component.
 */
export default function GmailHeaderActions({
  gmail,
  isConnecting,
  isSyncing,
  isSyncStarting,
  isCancelling,
  isDisconnecting,
  latestSyncLogId,
  onConnect,
  onSync,
  onCancel,
  onDisconnect,
}: GmailHeaderActionsProps) {
  const [confirmSync, setConfirmSync] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  if (!gmail) {
    return (
      <LoadingButton
        onClick={onConnect}
        isLoading={isConnecting}
        loadingText="Connecting..."
      >
        Connect Gmail
      </LoadingButton>
    );
  }

  if (gmail.needs_reauth) {
    // Token expired — show Reconnect instead of Sync/Disconnect. The OAuth
    // flow replaces the tokens without requiring a disconnect.
    return (
      <LoadingButton
        onClick={onConnect}
        isLoading={isConnecting}
        loadingText="Reconnecting..."
        data-testid="gmail-reconnect-button"
      >
        Reconnect Gmail
      </LoadingButton>
    );
  }

  const handleSyncConfirmed = () => {
    setConfirmSync(false);
    onSync();
  };

  const handleDisconnectConfirmed = () => {
    setConfirmDisconnect(false);
    onDisconnect();
  };

  return (
    <>
      {confirmSync ? (
        <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">Start email sync?</span>
          <button onClick={handleSyncConfirmed} className="text-primary font-medium hover:underline">
            Yes
          </button>
          <button
            onClick={() => setConfirmSync(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            No
          </button>
        </div>
      ) : (
        <LoadingButton
          variant="secondary"
          onClick={() => setConfirmSync(true)}
          disabled={isSyncing}
          isLoading={isSyncing || isSyncStarting}
          loadingText="Syncing..."
        >
          Sync now
        </LoadingButton>
      )}
      {isSyncing ? (
        <LoadingButton
          variant="ghost"
          onClick={() => onCancel(latestSyncLogId ?? undefined)}
          isLoading={isCancelling}
          loadingText="Cancelling..."
          className="text-destructive hover:text-destructive"
        >
          Cancel
        </LoadingButton>
      ) : confirmDisconnect ? (
        <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">Disconnect Gmail?</span>
          <button
            onClick={handleDisconnectConfirmed}
            className="text-destructive font-medium hover:underline"
          >
            Yes
          </button>
          <button
            onClick={() => setConfirmDisconnect(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            No
          </button>
        </div>
      ) : (
        <LoadingButton
          variant="ghost"
          onClick={() => setConfirmDisconnect(true)}
          isLoading={isDisconnecting}
          loadingText="Disconnecting..."
          className="text-destructive hover:text-destructive"
        >
          Disconnect
        </LoadingButton>
      )}
    </>
  );
}
