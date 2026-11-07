import { AlertTriangle } from "lucide-react";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import CraftSpecChoiceItem from "@/games/wow-forever/components/crafting/CraftSpecChoiceItem";
import { specChain } from "@/games/wow-forever/crafting/craftSpecs";
import type { SourceLookup } from "@/games/wow-forever/data/sourceDecode";
import type { CraftSpecRecord } from "@/games/wow-forever/types/crafting";
import type { CraftingSpecs } from "@/games/wow-forever/types/craftingSpecs";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface CraftSpecRowProps {
  specs: CraftingSpecs;
  records: readonly CraftSpecRecord[];
  sources: SourceLookup;
  faction: PlayerFaction;
  /** Null = not chosen yet. */
  chosen: string | null;
}

/** "At 200: choose a specialization" — a full-width break in the route where it forks. */
export default function CraftSpecRow({ specs, records, sources, faction, chosen }: CraftSpecRowProps) {
  const picked = new Set(chosen === null ? [] : specChain(specs, chosen).map((c) => c.id));
  return (
    <li className="p-3 bg-muted/40 space-y-2" data-testid="spec-decision">
      <p className="font-semibold">
        At {specs.forkAt}: choose a specialization{" "}
        <span className="font-normal text-muted-foreground">(Classic: needs level {specs.level})</span>{" "}
        {specs.confidence === "unconfirmed" ? <ProvenanceBadge provenance={PROVENANCE.unconfirmed} /> : null}
      </p>
      <p className="text-sm">{specs.intro}</p>
      <p className="flex items-start gap-1.5 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" aria-hidden />
        <span>{specs.unlearnWarning}</span>
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {specs.choices.map((choice) => (
          <CraftSpecChoiceItem
            key={choice.id}
            choice={choice}
            record={records.find((r) => r.spell === choice.spell)}
            sources={sources}
            faction={faction}
            chosen={picked.has(choice.id)}
          />
        ))}
      </ul>
    </li>
  );
}
