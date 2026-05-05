import { useCallback, useState } from "react";
import {
  useListPlaidItemsQuery,
  useDisconnectPlaidItemMutation,
  useSyncPlaidItemMutation,
} from "@/shared/store/plaidApi";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import { timeAgo } from "@/shared/utils/date";
import Badge from "@/shared/components/ui/Badge";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Button from "@/shared/components/ui/Button";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import Skeleton from "@/shared/components/ui/Skeleton";
import PlaidAccountMapping from "./PlaidAccountMapping";
import { PLAID_STATUS_BADGE } from "@/shared/lib/integration-config";
import type { PlaidItem } from "@/shared/types/plaid/plaid-item";

export interface PlaidItemListProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export default function PlaidItemList({ onSuccess, onError }: PlaidItemListProps) {
  const { data: items = [], isLoading } = useListPlaidItemsQuery();
  const [disconnectItem, { isLoading: isDisconnecting }] = useDisconnectPlaidItemMutation();
  const [syncItem] = useSyncPlaidItemMutation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<PlaidItem | null>(null);

  const handleSync = useCallback(
    (itemId: string) => {
      setSyncingId(itemId);
      syncItem(itemId)
        .unwrap()
        .then((result) => onSuccess(`Synced ${result.records_added} new transaction(s)`))
        .catch((err) => onError(`Sync failed: ${extractErrorMessage(err)}`))
        .finally(() => setSyncingId(null));
    },
    [syncItem, onSuccess, onError],
  );

  const handleDisconnect = useCallback(() => {
    if (!confirmDisconnect) return;
    const name = confirmDisconnect.institution_name ?? "this bank";
    disconnectItem(confirmDisconnect.id)
      .unwrap()
      .then(() => onSuccess(`Disconnected ${name}`))
      .catch((err) => onError(`Disconnect failed: ${extractErrorMessage(err)}`))
      .finally(() => setConfirmDisconnect(null));
  }, [confirmDisconnect, disconnectItem, onSuccess, onError]);

  if (isLoading) {
    return (
      <div className="space-y-3 mt-4">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <div className="space-y-3 mt-4">
        {items.map((item) => {
          const isExpanded = expandedId === item.id;
          const badge = PLAID_STATUS_BADGE[item.status];
          return (
            <div key={item.id} className="border rounded-lg">
              <div className="flex items-center justify-between p-4">
                <button
                  type="button"
                  className="flex items-center gap-3 text-left flex-1 min-w-0"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M2 10h20" />
                  </svg>
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {item.institution_name ?? "Unknown Bank"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.last_synced_at
                        ? `Last synced ${timeAgo(item.last_synced_at)}`
                        : "Never synced"}
                    </p>
                  </div>
                  <Badge label={badge.label} color={badge.color} />
                  {item.error_code ? (
                    <span className="text-xs text-red-500 ml-1">{item.error_code}</span>
                  ) : null}
                </button>

                <div className="flex items-center gap-2 ml-3">
                  <LoadingButton
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSync(item.id)}
                    isLoading={syncingId === item.id}
                    loadingText="Syncing..."
                  >
                    Sync
                  </LoadingButton>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmDisconnect(item)}
                  >
                    Disconnect
                  </Button>
                </div>
              </div>

              {isExpanded ? (
                <div className="border-t px-4 pb-4">
                  <PlaidAccountMapping itemId={item.id} onError={onError} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!confirmDisconnect}
        title="Disconnect bank"
        description={`Are you sure you want to disconnect ${confirmDisconnect?.institution_name ?? "this bank"}? Previously synced transactions will remain.`}
        confirmLabel="Disconnect"
        variant="danger"
        isLoading={isDisconnecting}
        onConfirm={handleDisconnect}
        onCancel={() => setConfirmDisconnect(null)}
      />
    </>
  );
}
