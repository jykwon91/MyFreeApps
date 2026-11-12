import CharacterRowSkeletons from "@/games/wow-forever/components/character/CharacterRowSkeletons";
import { GUILD_SKELETON_CONTROLS, GUILD_SKELETON_ROWS } from "@/games/wow-forever/data/guild/guildConfig";
import GuildPodiumSkeleton from "@/games/wow-forever/components/guild/GuildPodiumSkeleton";
import { GUILD_TITLE_SKELETON_ROWS } from "@/games/wow-forever/data/guild/guildTitles";
import { LEADERBOARD_SKELETON_CHIPS } from "@/games/wow-forever/data/guild/leaderboardConfig";

/** The guild page while it loads: summary line, recipe search, titles, leaderboard (chips, picker, podium, rows), toolbar, member rows. */
export default function GuildPageSkeleton() {
  return (
    <div className="space-y-4" aria-hidden data-testid="guild-page-skeleton">
      <div className="h-5 w-64 rounded bg-muted animate-pulse" />
      <div className="space-y-3 rounded-xl border p-3 sm:p-4" data-testid="guild-recipe-search-skeleton">
        <div className="h-6 w-44 rounded bg-muted animate-pulse" />
        <div className="h-[86px] rounded-md bg-muted animate-pulse sm:max-w-md" />
      </div>
      <div className="space-y-3 rounded-xl border p-3 sm:p-4" data-testid="guild-titles-skeleton">
        <div className="space-y-1">
          <div className="h-6 w-32 rounded bg-muted animate-pulse" />
          <div className="h-5 w-full max-w-md rounded bg-muted animate-pulse" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: GUILD_TITLE_SKELETON_ROWS }, (_, i) => (
            <div key={i} className="h-[96px] rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
      <div className="space-y-3 rounded-xl border p-3 sm:p-4" data-testid="guild-leaderboard-skeleton">
        <div className="h-6 w-36 rounded bg-muted animate-pulse" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: LEADERBOARD_SKELETON_CHIPS }, (_, i) => (
            <div key={i} className="h-11 w-24 shrink-0 rounded-full bg-muted animate-pulse" />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-[68px] rounded-md bg-muted animate-pulse" />
        </div>
        <GuildPodiumSkeleton />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: GUILD_SKELETON_CONTROLS }, (_, i) => (
          <div key={i} className="h-[68px] rounded-md bg-muted animate-pulse" />
        ))}
      </div>
      <CharacterRowSkeletons count={GUILD_SKELETON_ROWS} height="h-[45px]" />
    </div>
  );
}
