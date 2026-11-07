import clsx from "clsx";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { SOURCE_CHIP, type SourceChipKind } from "@/games/wow-forever/gear/gearSourceText";
import { gearSourceProvenance } from "@/games/wow-forever/lib/provenance/gearSourceProvenance";

/** How an item is got (crafted, quest, boss drop, or nothing known) and, for a known source, where that comes from. */
export default function GearSourceChip({ kind }: { kind: SourceChipKind }) {
  const provenance = gearSourceProvenance(kind);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        data-testid="gear-source-chip"
        className={clsx("inline-block rounded border px-1.5 py-0.5 text-xs", kind === "unknown" && "border-dashed")}
      >
        {SOURCE_CHIP[kind]}
      </span>
      {provenance ? <ProvenanceBadge provenance={provenance} /> : null}
    </span>
  );
}
