import type { ReactNode } from "react";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import type { Provenance } from "@/games/wow-forever/types/provenance/provenance";

interface ItemSourceSectionProps {
  title: string;
  /** Where the section's facts come from, tagged once on its heading. */
  provenance: Provenance;
  children: ReactNode;
}

/** One way to get the item: a heading, its provenance badge, its rows. */
export default function ItemSourceSection({ title, provenance, children }: ItemSourceSectionProps) {
  return (
    <section className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0" aria-label={title}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <ProvenanceBadge provenance={provenance} />
      </div>
      {children}
    </section>
  );
}
