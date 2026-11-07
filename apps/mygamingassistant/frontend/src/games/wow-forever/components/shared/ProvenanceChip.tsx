import clsx from "clsx";
import { PROVENANCE_ICON } from "@/games/wow-forever/data/provenance/provenanceIcons";
import { PROVENANCE_LABEL } from "@/games/wow-forever/data/provenance/provenanceLabels";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

interface ProvenanceChipProps extends Pick<ProvenanceTag, "provenance" | "date"> {
  className?: string;
}

/** The look of a provenance badge: icon + word in a neutral outline that never wraps. Unconfirmed is dashed. */
export default function ProvenanceChip({ provenance, date, className }: ProvenanceChipProps) {
  const Icon = PROVENANCE_ICON[provenance];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-normal leading-none text-muted-foreground align-middle",
        provenance === PROVENANCE.unconfirmed && "border-dashed",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {PROVENANCE_LABEL[provenance]}
      {date ? ` ${date}` : null}
    </span>
  );
}
