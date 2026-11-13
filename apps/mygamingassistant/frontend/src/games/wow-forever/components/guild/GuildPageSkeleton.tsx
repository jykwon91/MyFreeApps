import GuildArenaSkeleton from "@/games/wow-forever/components/guild/GuildArenaSkeleton";
import GuildCraftingSkeleton from "@/games/wow-forever/components/guild/GuildCraftingSkeleton";
import GuildRosterSkeleton from "@/games/wow-forever/components/guild/GuildRosterSkeleton";
import GuildTitlesSkeleton from "@/games/wow-forever/components/guild/GuildTitlesSkeleton";
import GuildWeekSkeleton from "@/games/wow-forever/components/guild/GuildWeekSkeleton";
import { GUILD_TAB_LABELS, GUILD_TABS } from "@/games/wow-forever/data/guild/guildTabs";
import { TAB_LIST_LAYOUTS } from "@/games/wow-forever/data/shared/tabListLayouts";
import type { GuildTab } from "@/games/wow-forever/types/guild/guildTab";

interface GuildPageSkeletonProps {
  /** The tab the link opens on: only its body is sketched, as only it will load. */
  tab: GuildTab;
}

/** The guild page while it loads: banner, the tab row, and the open tab's body. */
export default function GuildPageSkeleton({ tab }: GuildPageSkeletonProps) {
  return (
    <div className="space-y-4" aria-hidden data-testid="guild-page-skeleton">
      <div className="h-[196px] rounded-2xl bg-muted animate-pulse sm:h-[220px]" data-testid="guild-banner-skeleton" />
      <div className={TAB_LIST_LAYOUTS.scroll.list} data-testid="guild-tabs-skeleton">
        {GUILD_TABS.map((t) => (
          // The real labels, invisible, so each pill is its tab's width.
          <div key={t} className={`${TAB_LIST_LAYOUTS.scroll.tab} flex items-center bg-muted text-sm font-medium text-transparent animate-pulse`}>
            {GUILD_TAB_LABELS[t]}
          </div>
        ))}
      </div>
      {tab === "week" && <GuildWeekSkeleton />}
      {tab === "titles" && <GuildTitlesSkeleton />}
      {tab === "arena" && <GuildArenaSkeleton />}
      {tab === "crafting" && <GuildCraftingSkeleton />}
      {tab === "roster" && <GuildRosterSkeleton />}
    </div>
  );
}
