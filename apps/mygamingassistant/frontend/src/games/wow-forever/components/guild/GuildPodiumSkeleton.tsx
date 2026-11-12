import clsx from "clsx";
import CharacterRowSkeletons from "@/games/wow-forever/components/character/CharacterRowSkeletons";
import { LEADERBOARD_PODIUM_SIZE, LEADERBOARD_SKELETON_ROWS } from "@/games/wow-forever/data/guild/leaderboardConfig";
import { PODIUM_SLOTS } from "@/games/wow-forever/data/guild/guildStyles";

/** A board while it loads: three podium cards (the middle one tallest on wide screens), then rows. */
export default function GuildPodiumSkeleton() {
  return (
    <div className="space-y-2" aria-hidden data-testid="guild-podium-skeleton">
      <div className="grid grid-cols-1 gap-2 sm:grid-flow-row-dense sm:grid-cols-3 sm:items-end">
        {Array.from({ length: LEADERBOARD_PODIUM_SIZE }, (_, i) => (
          <div
            key={i}
            className={clsx(PODIUM_SLOTS[i], "rounded-xl bg-muted animate-pulse", i === 0 ? "h-[92px] sm:h-[220px]" : "h-[90px] sm:h-[198px]")}
          />
        ))}
      </div>
      <CharacterRowSkeletons count={LEADERBOARD_SKELETON_ROWS} height="h-[82px]" />
    </div>
  );
}
