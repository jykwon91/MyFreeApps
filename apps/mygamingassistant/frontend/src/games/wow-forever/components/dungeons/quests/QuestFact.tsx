import type { ReactNode } from "react";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

interface QuestFactProps {
  label: string;
  tag: ProvenanceTag;
  children: ReactNode;
}

/** One part of an opened quest ("Given by", "Objectives", …): its label and badge, then the fact itself. */
export default function QuestFact({ label, tag, children }: QuestFactProps) {
  return (
    <div className="space-y-1" data-testid="quest-fact">
      <h4 className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {label} <ProvenanceBadge {...tag} />
      </h4>
      {children}
    </div>
  );
}
