import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { PLAYER_FACTION_OPTIONS } from "@/games/wow-forever/data/playerFactionOptions";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface BisListFactionToggleProps {
  faction: PlayerFaction;
  onChange: (faction: PlayerFaction) => void;
}

/** Which side's quests the "where from" lines (and recommended picks) use — the same choice as Best gear's Faction. */
export default function BisListFactionToggle({ faction, onChange }: BisListFactionToggleProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-xs font-medium text-muted-foreground">Quest sources for</span>
      <SegmentedToggle label="Quest sources for" options={PLAYER_FACTION_OPTIONS} value={faction} onChange={onChange} />
    </div>
  );
}
