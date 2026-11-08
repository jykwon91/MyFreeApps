import { Minus, Plus } from "lucide-react";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { LEGACY_UNKNOWN } from "@/games/wow-forever/data/legacy/legacyConfig";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { LegacyNode } from "@/games/wow-forever/types/legacy/legacyNode";

interface LegacyNodeDetailsProps {
  treeName: string;
  node: LegacyNode;
  rank: number;
  addBlock: string | null;
  removeBlock: string | null;
  onAdd: () => void;
  onRemove: () => void;
}

/** The picked talent: what it does, its rank, what blocks a change, and − / +. */
export default function LegacyNodeDetails({
  treeName,
  node,
  rank,
  addBlock,
  removeBlock,
  onAdd,
  onRemove,
}: LegacyNodeDetailsProps) {
  return (
    <section aria-label="Picked talent" className="space-y-2 rounded-xl border bg-card p-3 sm:p-4" data-testid="legacy-details">
      <div className="flex items-start gap-3">
        <GameIcon icon={fileIcon(node.icon)} size={48} alt="" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{node.comingLater ? "Coming in a future update" : node.name}</h3>
          <p className="text-sm text-muted-foreground">
            {treeName}
            {node.comingLater ? null : ` · rank ${rank} of ${node.maxRanks}`}
            {node.gate > 0 ? ` · opens after ${node.gate} points in ${treeName}` : null}
          </p>
        </div>
      </div>
      <p className="text-sm">{node.text ?? "The game files' text for this talent couldn't be read."}</p>
      {!node.comingLater && node.maxRanks > 1 ? (
        <p className="text-sm text-muted-foreground">
          The game files give one value for this talent. How it grows with each rank: {LEGACY_UNKNOWN.perRank}
        </p>
      ) : null}
      {node.comingLater ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRemove}
            disabled={removeBlock !== null}
            aria-label={`Take a point out of ${node.name}`}
            data-testid="legacy-details-remove"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border hover:bg-muted/40 disabled:opacity-40"
          >
            <Minus aria-hidden className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onAdd}
            disabled={addBlock !== null}
            aria-label={`Add a point to ${node.name}`}
            data-testid="legacy-details-add"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border hover:bg-muted/40 disabled:opacity-40"
          >
            <Plus aria-hidden className="h-4 w-4" />
          </button>
          <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="legacy-block">
            {addBlock ?? ""}
          </p>
        </div>
      )}
    </section>
  );
}
