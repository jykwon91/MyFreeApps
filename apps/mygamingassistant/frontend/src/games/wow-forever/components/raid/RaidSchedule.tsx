import { cn } from "@platform/ui";
import RaidIcon from "@/games/wow-forever/components/raid/RaidIcon";
import { RAID_ICON, RAID_STATE } from "@/games/wow-forever/data/raidPage";
import { formatRaidClock, formatRaidDay, fromNow } from "@/games/wow-forever/lib/raidTime";
import type { RaidPage } from "@/games/wow-forever/types/raid";

interface RaidScheduleProps {
  page: Pick<RaidPage, "starts_at" | "closes_at" | "state" | "icons_version">;
  now: number;
}

/** When the raid starts — in the viewer's zone, and how soon — and when sign-ups close while they're open. */
export default function RaidSchedule({ page, now }: RaidScheduleProps) {
  const cancelled = page.state === RAID_STATE.CANCELLED;
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="inline-flex flex-wrap items-center gap-x-1.5">
        <RaidIcon name={RAID_ICON.DATE} version={page.icons_version} alt="" />
        <time dateTime={page.starts_at} className={cn("font-medium", cancelled && "line-through")}>
          {formatRaidDay(page.starts_at)} · {formatRaidClock(page.starts_at)}
        </time>
        <span className="text-muted-foreground">({fromNow(page.starts_at, now)})</span>
      </span>
      {page.closes_at && (
        <span className="inline-flex items-center gap-1.5">
          <RaidIcon name={RAID_ICON.LOCK} version={page.icons_version} alt="" />
          <span>
            Sign-ups close <time dateTime={page.closes_at}>{fromNow(page.closes_at, now)}</time>
          </span>
        </span>
      )}
    </p>
  );
}
