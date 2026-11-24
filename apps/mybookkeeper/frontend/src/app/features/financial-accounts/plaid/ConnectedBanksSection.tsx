import { useListPlaidItemsQuery } from "@mybookkeeper/api-client/store/plaidApi";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { PLAID_MESSAGES as MSG } from "@/shared/lib/plaid-messages";
import ConnectedBankRow from "./ConnectedBankRow";
import ConnectedBanksSkeleton from "./ConnectedBanksSkeleton";

export interface ConnectedBanksSectionProps {
  onReconnect: (itemId: string) => void;
  onAddInvestments: (itemId: string) => void;
  /** The connection Link is being opened for, if any. */
  reconnectingItemId: string | null | undefined;
}

/** The person's bank connections; nothing at all until they have one, so the manual flow looks as before. */
export default function ConnectedBanksSection({ onReconnect, onAddInvestments, reconnectingItemId }: ConnectedBanksSectionProps) {
  const query = useListPlaidItemsQuery();

  if (query.isLoading) return <ConnectedBanksSkeleton />;
  if (query.isError) {
    return <LoadErrorAlert message={MSG.loadFailed} isRetrying={query.isFetching} onRetry={() => void query.refetch()} />;
  }
  const items = query.data ?? [];
  if (items.length === 0) return null;

  return (
    <section className="space-y-2" data-testid="connected-banks">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{MSG.sectionTitle}</h2>
      <p className="text-xs text-muted-foreground">{MSG.sectionHint}</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <ConnectedBankRow
            key={item.id}
            item={item}
            onReconnect={onReconnect}
            onAddInvestments={onAddInvestments}
            isReconnecting={reconnectingItemId === item.id}
          />
        ))}
      </ul>
    </section>
  );
}
