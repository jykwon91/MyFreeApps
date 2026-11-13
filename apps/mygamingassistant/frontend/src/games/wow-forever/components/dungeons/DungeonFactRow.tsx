import type { ReactNode } from "react";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import type { Provenance } from "@/games/wow-forever/types/provenance/provenance";

interface DungeonFactRowProps {
  label: string;
  /** Where the fact comes from; none for a fact we don't know. */
  provenance?: Provenance;
  children: ReactNode;
}

/** One labelled fact with its provenance badge (when known), a `<dt>`/`<dd>` pair inside the section's `<dl>`. */
export default function DungeonFactRow({ label, provenance, children }: DungeonFactRowProps) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[12rem_1fr] sm:gap-3" data-testid="dungeon-fact">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2 text-sm">
        <span>{children}</span>
        {provenance ? <ProvenanceBadge provenance={provenance} /> : null}
      </dd>
    </div>
  );
}
