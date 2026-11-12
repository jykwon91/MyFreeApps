import clsx from "clsx";
import { useId, useRef, type KeyboardEvent } from "react";
import CharacterStatList from "@/games/wow-forever/components/character/CharacterStatList";
import { CHARACTER_STATS_TAB_LABELS, CHARACTER_STATS_TABS } from "@/games/wow-forever/data/character/characterStatsConfig";
import { useCharacterStatsTab } from "@/games/wow-forever/hooks/useCharacterStatsTab";
import { tabLines } from "@/games/wow-forever/lib/character/characterStats";
import { tabAfterKey } from "@/games/wow-forever/lib/tabKeyNavigation";
import type { CharacterStats } from "@/games/wow-forever/types/character/characterStats";

interface CharacterStatsTabsProps {
  stats: CharacterStats;
  characterClass: string;
}

/** The game pane's Melee / Ranged / Spell / Defenses drop-down, as tabs. */
export default function CharacterStatsTabs({ stats, characterClass }: CharacterStatsTabsProps) {
  const [tab, setTab] = useCharacterStatsTab(characterClass);
  const panelId = useId();
  const tablist = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = tabAfterKey(CHARACTER_STATS_TABS, tab, event.key);
    if (next === null) return;
    event.preventDefault();
    setTab(next);
    tablist.current?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
  }

  return (
    <div className="space-y-2">
      <div ref={tablist} role="tablist" aria-label="Stat group" onKeyDown={onKeyDown} className="grid grid-cols-4 gap-1 rounded-lg bg-muted/40 p-1">
        {CHARACTER_STATS_TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`${panelId}-tab-${t}`}
            data-tab={t}
            aria-selected={t === tab}
            aria-controls={panelId}
            tabIndex={t === tab ? 0 : -1}
            onClick={() => setTab(t)}
            className={clsx(
              "min-h-11 rounded-md px-2 text-sm font-medium",
              t === tab ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {CHARACTER_STATS_TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={`${panelId}-tab-${tab}`}>
        <CharacterStatList lines={tabLines(stats, tab)} label={`${CHARACTER_STATS_TAB_LABELS[tab]} stats`} />
      </div>
    </div>
  );
}
