import { useId } from "react";
import CharacterStatList from "@/games/wow-forever/components/character/CharacterStatList";
import TabList from "@/games/wow-forever/components/shared/TabList";
import { CHARACTER_STATS_TAB_LABELS, CHARACTER_STATS_TABS } from "@/games/wow-forever/data/character/characterStatsConfig";
import { useCharacterStatsTab } from "@/games/wow-forever/hooks/useCharacterStatsTab";
import { tabLines } from "@/games/wow-forever/lib/character/characterStats";
import { tabId, tabPanelId } from "@/games/wow-forever/lib/shared/tabIds";
import type { CharacterStats } from "@/games/wow-forever/types/character/characterStats";

interface CharacterStatsTabsProps {
  stats: CharacterStats;
  characterClass: string;
}

/** The game pane's Melee / Ranged / Spell / Defenses drop-down, as tabs. */
export default function CharacterStatsTabs({ stats, characterClass }: CharacterStatsTabsProps) {
  const [tab, setTab] = useCharacterStatsTab(characterClass);
  const idPrefix = useId();

  return (
    <div className="space-y-2">
      <TabList
        tabs={CHARACTER_STATS_TABS}
        labels={CHARACTER_STATS_TAB_LABELS}
        current={tab}
        onSelect={setTab}
        label="Stat group"
        idPrefix={idPrefix}
        layout="grid"
      />
      <div role="tabpanel" id={tabPanelId(idPrefix)} aria-labelledby={tabId(idPrefix, tab)} tabIndex={0} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <CharacterStatList lines={tabLines(stats, tab)} label={`${CHARACTER_STATS_TAB_LABELS[tab]} stats`} />
      </div>
    </div>
  );
}
