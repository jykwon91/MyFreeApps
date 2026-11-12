import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useId } from "react";
import CharacterReputationRow from "@/games/wow-forever/components/character/CharacterReputationRow";
import { formatFactionCount } from "@/games/wow-forever/lib/character/characterReputation";
import type { CharacterReputationGroup as ReputationGroup } from "@/games/wow-forever/types/character/characterReputationGroup";

interface CharacterReputationGroupProps {
  group: ReputationGroup;
  open: boolean;
  onToggle: () => void;
}

/** One header of the reputation pane: a button that shows or hides its factions. */
export default function CharacterReputationGroup({ group, open, onToggle }: CharacterReputationGroupProps) {
  const panelId = useId();
  return (
    <div className="rounded-xl border bg-card" data-testid="character-reputation-group">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1 font-medium">{group.name}</span>
        <span className="text-xs text-muted-foreground">{formatFactionCount(group.reputations.length)}</span>
        <ChevronDown aria-hidden className={clsx("h-4 w-4 shrink-0", open && "rotate-180")} />
      </button>
      <ul id={panelId} aria-label={`${group.name} factions`} hidden={!open} className="divide-y border-t px-4">
        {group.reputations.map((reputation) => (
          <CharacterReputationRow key={reputation.id} reputation={reputation} groupId={group.id} />
        ))}
      </ul>
    </div>
  );
}
