import { LoadingButton } from "@platform/ui";
import { refreshCooldownCopy } from "@/games/wow-forever/data/refreshCooldownCopy";
import { PRICE_REFRESH_COPY } from "@/games/wow-forever/data/priceRefreshConfig";
import { usePriceRefresh } from "@/games/wow-forever/hooks/usePriceRefresh";
import { cooldownMinutes } from "@/games/wow-forever/lib/refreshCooldown";
import type { PriceHouse } from "@/games/wow-forever/types/priceHouse";

/**
 * "Refresh now": asks the server to pull this auction house from Blizzard. Waits out the server's
 * cooldown (and says how long), and says plainly when Blizzard has nothing newer yet.
 */
export default function PriceRefreshButton({ house }: { house: PriceHouse }) {
  const { isReady, loadFailed, isRefreshing, cooldownLeft, notice, refresh } = usePriceRefresh(house);
  if (loadFailed) return null;
  if (!isReady) {
    return <div className="h-11 w-32 rounded bg-muted animate-pulse" aria-hidden data-testid="price-refresh-skeleton" />;
  }
  const coolingDown = cooldownLeft > 0 && !isRefreshing;
  const note = notice ?? (coolingDown ? refreshCooldownCopy(cooldownMinutes(cooldownLeft)) : null);
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="price-refresh">
      <LoadingButton
        variant="secondary"
        size="sm"
        isLoading={isRefreshing}
        loadingText={PRICE_REFRESH_COPY.loading}
        disabled={coolingDown}
        onClick={() => void refresh()}
        className="min-h-[44px]"
      >
        {PRICE_REFRESH_COPY.button}
      </LoadingButton>
      {note ? (
        <span role="status" className="text-xs text-muted-foreground">
          {note}
        </span>
      ) : null}
    </div>
  );
}
