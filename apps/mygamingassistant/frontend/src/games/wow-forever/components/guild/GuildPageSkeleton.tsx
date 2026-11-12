import CharacterRowSkeletons from "@/games/wow-forever/components/character/CharacterRowSkeletons";
import { GUILD_SKELETON_CONTROLS, GUILD_SKELETON_ROWS } from "@/games/wow-forever/data/guild/guildConfig";

/** The guild page while it loads: summary line, toolbar, member rows. */
export default function GuildPageSkeleton() {
  return (
    <div className="space-y-4" aria-hidden data-testid="guild-page-skeleton">
      <div className="h-5 w-64 rounded bg-muted/40 animate-pulse" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: GUILD_SKELETON_CONTROLS }, (_, i) => (
          <div key={i} className="h-[68px] rounded-md bg-muted/40 animate-pulse" />
        ))}
      </div>
      <CharacterRowSkeletons count={GUILD_SKELETON_ROWS} height="h-[45px]" />
    </div>
  );
}
