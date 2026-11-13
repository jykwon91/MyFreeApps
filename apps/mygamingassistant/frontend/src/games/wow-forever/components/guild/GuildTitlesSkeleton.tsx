import GuildSkeletonCard from "@/games/wow-forever/components/guild/GuildSkeletonCard";
import { GUILD_TITLE_SKELETON_ROWS } from "@/games/wow-forever/data/guild/guildTitles";

/** The Titles tab while it loads: heading, tagline, title cards. */
export default function GuildTitlesSkeleton() {
  return (
    <GuildSkeletonCard testId="guild-titles-skeleton">
      <div className="h-5 w-full max-w-md rounded bg-muted animate-pulse" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: GUILD_TITLE_SKELETON_ROWS }, (_, i) => (
          <div key={i} className="h-[96px] rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    </GuildSkeletonCard>
  );
}
