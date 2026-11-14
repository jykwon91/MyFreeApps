import clsx from "clsx";
import CharacterRowSkeletons from "@/games/wow-forever/components/character/CharacterRowSkeletons";
import { LEADERBOARD_PODIUM_SIZE, LEADERBOARD_SKELETON_ROWS } from "@/games/wow-forever/data/guild/leaderboardConfig";
import { PODIUM_SLOTS } from "@/games/wow-forever/data/guild/guildStyles";

/** A board while it loads: three podium cards (each with its member's picture; the middle one, the champion's, tallest on wide screens), then rows. */
export default function GuildPodiumSkeleton() {
  return (
    <div className="space-y-2" aria-hidden data-testid="guild-podium-skeleton">
      <div className="grid grid-cols-1 gap-2 sm:grid-flow-row-dense sm:grid-cols-3 sm:items-end">
        {Array.from({ length: LEADERBOARD_PODIUM_SIZE }, (_, i) => (
          // Every card carries a picture; the champion's is the bigger one (PODIUM_RENDER). Heights measured from the real cards.
          <div
            key={i}
            className={clsx(PODIUM_SLOTS[i], "rounded-xl bg-muted animate-pulse", i === 0 ? "h-[126px] sm:h-[390px]" : "h-[109px] sm:h-[321px]")}
          />
        ))}
      </div>
      <CharacterRowSkeletons count={LEADERBOARD_SKELETON_ROWS} height="h-[82px]" />
    </div>
  );
}
