import { joinWithAnd } from "@/shared/lib/format-list";
import { formatFilingDate } from "@/shared/lib/rate-filing-format";
import type { RateWatchAction } from "@/shared/types/insurance/rate-watch-action";

export interface RateWatchActionItemProps {
  action: RateWatchAction;
}

/**
 * What to do about the increase, in one instruction.
 *
 * The operator's question about the shipped screen was "do i need to manually
 * search these insurance companies and call? it's not clear what the action
 * item is." Both halves are answered here rather than inferred: yes, you call,
 * because a Texas landlord policy is agent-placed and cannot be quoted online;
 * and these are the carriers to name.
 *
 * Rendered only when ``buildRateWatchAction`` returns something, which is only
 * when a policy has an increase filed against it. An instruction that shows up
 * on a clean check trains the reader to skip it on the one that matters.
 */
export default function RateWatchActionItem({
  action,
}: RateWatchActionItemProps) {
  const deadline = action.renewalDate
    ? ` before ${formatFilingDate(action.renewalDate)}`
    : "";

  return (
    <div
      className="rounded-lg border border-border bg-muted/40 p-4"
      data-testid="rate-watch-action"
    >
      <h3 className="text-sm font-semibold">What to do</h3>

      {action.carrierNames.length > 0 ? (
        <p className="text-sm mt-1">
          Ask your agent to quote{" "}
          <span className="font-medium">
            {joinWithAnd(action.carrierNames)}
          </span>
          {deadline} — Texas filings show them holding dwelling rates flat or
          cutting them recently.
        </p>
      ) : (
        // The increase is real even when no alternative stands out. Saying
        // "call your agent" without names is still the correct instruction;
        // inventing names because the callout looks bare would not be.
        <p className="text-sm mt-1">
          Ask your agent whether another carrier will quote your property
          {deadline} — Texas's dwelling filings don't currently show anyone
          holding rates flat to suggest by name.
        </p>
      )}

      <p className="text-xs text-muted-foreground mt-2">
        A landlord policy can't be bought online, so your agent is the only way
        to get a real number for your property.
      </p>
    </div>
  );
}
