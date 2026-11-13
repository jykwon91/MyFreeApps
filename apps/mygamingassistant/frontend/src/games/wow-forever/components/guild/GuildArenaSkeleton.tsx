import GuildPodiumSkeleton from "@/games/wow-forever/components/guild/GuildPodiumSkeleton";
import GuildSkeletonCard from "@/games/wow-forever/components/guild/GuildSkeletonCard";
import { LEADERBOARD_SKELETON_CHIPS } from "@/games/wow-forever/data/guild/leaderboardConfig";

/** The Arena tab while it loads: category chips, board picker, podium and rows. */
export default function GuildArenaSkeleton() {
  return (
    <GuildSkeletonCard testId="guild-leaderboard-skeleton">
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: LEADERBOARD_SKELETON_CHIPS }, (_, i) => (
          <div key={i} className="h-11 w-24 shrink-0 rounded-full bg-muted animate-pulse" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-[68px] rounded-md bg-muted animate-pulse" />
      </div>
      <GuildPodiumSkeleton />
    </GuildSkeletonCard>
  );
}
