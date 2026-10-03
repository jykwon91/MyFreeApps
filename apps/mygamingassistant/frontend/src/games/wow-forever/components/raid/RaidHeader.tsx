import RaidDiscordLink from "@/games/wow-forever/components/raid/RaidDiscordLink";
import RaidIcon from "@/games/wow-forever/components/raid/RaidIcon";
import RaidSchedule from "@/games/wow-forever/components/raid/RaidSchedule";
import RaidStateChip from "@/games/wow-forever/components/raid/RaidStateChip";
import { RAID_ICON } from "@/games/wow-forever/data/raidPage";
import { raidSubtitle, seatsLabel } from "@/games/wow-forever/lib/raidLabels";
import type { RaidPage } from "@/games/wow-forever/types/raid";

interface RaidHeaderProps {
  page: RaidPage;
  now: number;
}

/**
 * The raid's banner, title, time, state and sign-up count. The left border is the post's colour, like the embed's
 * bar: the leader's pick while sign-ups are open, grey after. The banner sits in a 4:1 box (the art is 1200×300), so
 * nothing shifts as it loads; a cancelled raid has none.
 */
export default function RaidHeader({ page, now }: RaidHeaderProps) {
  const subtitle = raidSubtitle(page);
  return (
    <section aria-labelledby="raid-title" className="overflow-hidden rounded-xl border bg-card">
      {page.banner_url && (
        <div className="aspect-[4/1] w-full bg-muted">
          <img src={page.banner_url} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="space-y-3 border-l-4 p-4 sm:p-5" style={{ borderLeftColor: page.color }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 id="raid-title" className="break-words text-2xl font-semibold">
              {page.title}
            </h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {page.discord_url && <RaidDiscordLink url={page.discord_url} />}
        </div>
        <RaidSchedule page={page} now={now} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <RaidStateChip state={page.state} />
          <span className="inline-flex items-center gap-1.5">
            <RaidIcon name={RAID_ICON.SIGNUPS} version={page.icons_version} alt="" />
            {seatsLabel(page)}
          </span>
        </div>
        {page.cancel_reason && (
          <p className="text-sm">
            <span className="font-semibold">Cancelled:</span> {page.cancel_reason}
          </p>
        )}
      </div>
    </section>
  );
}
