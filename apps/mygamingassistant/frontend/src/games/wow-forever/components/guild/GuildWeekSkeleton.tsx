import GuildSkeletonCard from "@/games/wow-forever/components/guild/GuildSkeletonCard";
import { GUILD_HEROES_SKELETON_CARDS, HOT_RACES_SHOWN } from "@/games/wow-forever/data/guild/guildHallCopy";

/** The rest of the Home tab (under the Arena) while it loads: the heroes strip, then the hot races. */
export default function GuildWeekSkeleton() {
  return (
    <>
      <GuildSkeletonCard testId="guild-heroes-skeleton">
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: GUILD_HEROES_SKELETON_CARDS }, (_, i) => (
            <div key={i} className="h-[132px] w-[78%] shrink-0 rounded-xl bg-muted animate-pulse sm:w-auto sm:flex-1" />
          ))}
        </div>
      </GuildSkeletonCard>
      <GuildSkeletonCard testId="guild-hot-races-skeleton">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: HOT_RACES_SHOWN }, (_, i) => (
            <div key={i} className="h-[112px] rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </GuildSkeletonCard>
    </>
  );
}
