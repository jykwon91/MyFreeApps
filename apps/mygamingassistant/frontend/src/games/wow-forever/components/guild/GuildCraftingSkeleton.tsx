import GuildSkeletonCard from "@/games/wow-forever/components/guild/GuildSkeletonCard";

/** The Who can craft? tab while it loads: the recipe search box. */
export default function GuildCraftingSkeleton() {
  return (
    <GuildSkeletonCard testId="guild-recipe-search-skeleton">
      <div className="h-[86px] rounded-md bg-muted animate-pulse sm:max-w-md" />
    </GuildSkeletonCard>
  );
}
