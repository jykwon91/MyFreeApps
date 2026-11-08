import AskCardLink from "@/games/wow-forever/components/ask/cards/AskCardLink";
import ServerRulesetList from "@/games/wow-forever/components/serverStatus/ServerRulesetList";
import SummaryLine from "@/games/wow-forever/components/serverStatus/SummaryLine";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { ASK_LIVE } from "@/games/wow-forever/data/ask/askLiveStates";
import { SERVER_STATUS_COPY } from "@/games/wow-forever/data/serverStatus/serverStatusCopy";
import { useNow } from "@/games/wow-forever/hooks/useNow";
import { regionLabel } from "@/games/wow-forever/lib/ask/askRegion";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import type { AskServerStatusCard } from "@/games/wow-forever/types/ask/askServerStatusCard";

/** "Checked 2 minutes ago" re-reads the clock this often. */
const CLOCK_MS = 60_000;

interface ServerStatusCardProps {
  card: AskServerStatusCard;
}

/** Each ruleset up or down and when it was checked — or that Blizzard couldn't be reached, which isn't "down". */
export default function ServerStatusCard({ card }: ServerStatusCardProps) {
  useNow(CLOCK_MS);
  const region = regionLabel(card.region);
  const heading = ASK_COPY.serverStatusHeading(region);
  const offline = card.rulesets.filter((r) => !r.online).length;
  return (
    <section aria-label={heading} className="space-y-2 rounded-xl border bg-card p-3">
      <h3 className="text-sm font-semibold">{heading}</h3>
      {card.state === ASK_LIVE.error ? <p className="text-sm text-muted-foreground">{SERVER_STATUS_COPY.unreachable}</p> : null}
      {card.state === ASK_LIVE.none ? <p className="text-sm text-muted-foreground">{ASK_COPY.serverStatusNone(region)}</p> : null}
      {card.state === ASK_LIVE.ready ? (
        <>
          <p className="text-sm font-medium">
            <SummaryLine offlineCount={offline} total={card.rulesets.length} />
          </p>
          <ServerRulesetList rulesets={card.rulesets} />
        </>
      ) : null}
      {card.checkedAt ? <p className="text-xs text-muted-foreground">{ASK_COPY.checked(relativeTime(card.checkedAt))}</p> : null}
      <AskCardLink to={card.pageHref}>{ASK_COPY.openServerStatus}</AskCardLink>
    </section>
  );
}
