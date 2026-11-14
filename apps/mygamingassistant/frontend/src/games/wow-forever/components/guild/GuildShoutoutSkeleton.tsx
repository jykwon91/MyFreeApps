import { SHOUTOUT_CARD } from "@/games/wow-forever/data/guild/guildStyles";

/** The shout-out card while the guild loads: the badge, the name and its detail line. */
export default function GuildShoutoutSkeleton() {
  return (
    <div className={SHOUTOUT_CARD} data-testid="guild-shoutout-skeleton">
      <div className="h-7 w-48 rounded-full bg-muted animate-pulse" />
      <div className="flex flex-col">
        {/* The name link is 44px tall; its detail line is text-sm. */}
        <div className="flex h-11 items-center">
          <div className="h-7 w-40 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex h-5 items-center">
          <div className="h-4 w-28 rounded bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  );
}
