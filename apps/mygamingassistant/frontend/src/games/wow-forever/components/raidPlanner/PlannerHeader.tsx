import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import LinkExpiry from "@/games/wow-forever/components/raidPlanner/LinkExpiry";
import { RAID_BUTTON_CLASS } from "@/games/wow-forever/data/raidPage";
import { sizeLabel } from "@/games/wow-forever/lib/raidPlanLabels";
import { formatRaidClock, formatRaidDay } from "@/games/wow-forever/lib/raidTime";
import type { RaidPlan } from "@/games/wow-forever/types/raidPlan";

interface PlannerHeaderProps {
  plan: RaidPlan;
  now: number;
}

/** The raid being planned — its title, time and size — how long the link lasts, and its web page, in a new tab. */
export default function PlannerHeader({ plan, now }: PlannerHeaderProps) {
  return (
    <header className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <h1 className="break-words text-xl font-semibold sm:text-2xl">Groups — {plan.title}</h1>
        <p className="text-sm text-muted-foreground">
          <time dateTime={plan.starts_at}>
            {formatRaidDay(plan.starts_at)} · {formatRaidClock(plan.starts_at)}
          </time>
          {` · ${sizeLabel(plan.size_cap, plan.group_count)}`}
        </p>
        <LinkExpiry expiresAt={plan.link_expires_at} now={now} />
      </div>
      {/* A new tab: leaving the planner would lose what isn't saved. */}
      <Link
        to={`/wow-forever/raids/${encodeURIComponent(plan.web_id)}`}
        target="_blank"
        rel="noopener"
        className={RAID_BUTTON_CLASS}
      >
        <ExternalLink aria-hidden className="h-4 w-4" />
        Raid page{" "}
        <span className="sr-only">(opens in a new tab)</span>
      </Link>
    </header>
  );
}
