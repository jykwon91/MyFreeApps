import { useId, useMemo } from "react";
import GuildHeroes from "@/games/wow-forever/components/guild/GuildHeroes";
import GuildHotRaces from "@/games/wow-forever/components/guild/GuildHotRaces";
import GuildLeaderboards from "@/games/wow-forever/components/guild/GuildLeaderboards";
import GuildQuests from "@/games/wow-forever/components/guild/GuildQuests";
import GuildRecipeSearch from "@/games/wow-forever/components/guild/GuildRecipeSearch";
import GuildRollCall from "@/games/wow-forever/components/guild/GuildRollCall";
import GuildTitlesStrip from "@/games/wow-forever/components/guild/GuildTitlesStrip";
import TabList from "@/games/wow-forever/components/shared/TabList";
import { GUILD_TAB_LABELS, GUILD_TABS, GUILD_TABS_LABEL } from "@/games/wow-forever/data/guild/guildTabs";
import { useLeaderboardParams } from "@/games/wow-forever/hooks/useLeaderboardParams";
import { awardGuildTitles } from "@/games/wow-forever/lib/guild/guildTitles";
import { tabId, tabPanelId } from "@/games/wow-forever/lib/shared/tabIds";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";
import type { GuildTab } from "@/games/wow-forever/types/guild/guildTab";

interface GuildPageSectionsProps {
  guild: GuildResponse;
  tab: GuildTab;
  onTab: (tab: GuildTab) => void;
}

/**
 * A guild with members, in tabs kept in the URL: Home (the Arena, then this week's heroes, the viewer's
 * quests and hot races), the Hall of Titles, the recipe search, and the roster (member list, titles by each name).
 * Only the open tab renders.
 */
export default function GuildPageSections({ guild, tab, onTab }: GuildPageSectionsProps) {
  const titles = useMemo(() => awardGuildTitles(guild.members), [guild.members]);
  const { me } = useLeaderboardParams();
  const idPrefix = useId();
  return (
    <div className="space-y-4">
      <TabList
        tabs={GUILD_TABS}
        labels={GUILD_TAB_LABELS}
        current={tab}
        onSelect={onTab}
        label={GUILD_TABS_LABEL}
        idPrefix={idPrefix}
        layout="scroll"
      />
      <div role="tabpanel" id={tabPanelId(idPrefix)} aria-labelledby={tabId(idPrefix, tab)} tabIndex={0} className="space-y-4 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {tab === "home" && (
          <>
            <GuildLeaderboards slug={guild.slug} members={guild.members} gainsWindowDays={guild.gains_window_days} />
            <GuildHeroes members={guild.members} gainsWindowDays={guild.gains_window_days} />
            <GuildQuests members={guild.members} titles={titles} me={me} />
            <GuildHotRaces members={guild.members} titles={titles} />
          </>
        )}
        {tab === "titles" && <GuildTitlesStrip titles={titles} />}
        {tab === "crafting" && <GuildRecipeSearch slug={guild.slug} />}
        {tab === "roster" && <GuildRollCall members={guild.members} rosterUpdatedAt={guild.roster_updated_at} titles={titles.bySlug} />}
      </div>
    </div>
  );
}
