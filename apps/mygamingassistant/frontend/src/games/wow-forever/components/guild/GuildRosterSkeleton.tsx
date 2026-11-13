import CharacterRowSkeletons from "@/games/wow-forever/components/character/CharacterRowSkeletons";
import GuildSkeletonCard from "@/games/wow-forever/components/guild/GuildSkeletonCard";
import { GUILD_SKELETON_CONTROLS, GUILD_SKELETON_ROWS } from "@/games/wow-forever/data/guild/guildConfig";

/** The Roster tab while it loads: the member toolbar and rows. */
export default function GuildRosterSkeleton() {
  return (
    <GuildSkeletonCard testId="guild-roster-skeleton">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: GUILD_SKELETON_CONTROLS }, (_, i) => (
          <div key={i} className="h-[68px] rounded-md bg-muted animate-pulse" />
        ))}
      </div>
      <CharacterRowSkeletons count={GUILD_SKELETON_ROWS} height="h-[45px]" />
    </GuildSkeletonCard>
  );
}
