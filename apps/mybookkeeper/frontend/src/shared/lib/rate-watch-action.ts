import { worstOutlook } from "@/shared/lib/rate-watch-verdict";
import { ACTION_CARRIER_LIMIT } from "@/shared/lib/rate-watch-constants";
import type { InsuranceMarketWatch } from "@/shared/types/insurance/insurance-market-watch";
import type { RateWatchAction } from "@/shared/types/insurance/rate-watch-action";

/**
 * The shortlist to raise with an agent, and the date to raise it by.
 *
 * Returns null whenever there is nothing to do: the feed was unreachable,
 * nothing was checked, or no policy has an increase filed against it. An
 * action item that appears when there is no action is worse than none, because
 * the next real one gets read as decoration.
 *
 * The names come from ``market_flat``, which the backend has already deduped
 * to one row per carrier and filtered to carriers a landlord can actually be
 * placed with. Taking them from the same array the "Holding rates flat" list
 * renders is deliberate — a shortlist in the callout that disagreed with the
 * list below it would leave the operator reconciling two sets of names.
 */
export function buildRateWatchAction(
  data: InsuranceMarketWatch,
): RateWatchAction | null {
  if (data.feed_unavailable_reason !== null) return null;
  if (data.checked_policy_count === 0) return null;

  const worst = worstOutlook(data.outlooks);
  if (worst === null) return null;

  return {
    renewalDate: worst.expiration_date,
    carrierNames: data.market_flat
      .slice(0, ACTION_CARRIER_LIMIT)
      .map((filing) => filing.company_name),
  };
}
