import ProvenanceChip from "@/games/wow-forever/components/shared/ProvenanceChip";
import {
  PROVENANCE_DESCRIPTION,
  PROVENANCE_GUIDE,
  PROVENANCE_ORDER,
} from "@/games/wow-forever/data/provenance/provenanceLabels";

/** "How to read these tags": every provenance badge and what it means, most trusted first. In every WoW Forever page's footer. */
export default function ProvenanceGuide() {
  return (
    <details className="group max-w-4xl px-4 text-xs text-muted-foreground sm:px-8" data-testid="provenance-guide">
      <summary className="inline-flex min-h-[44px] cursor-pointer items-center underline-offset-2 hover:underline sm:min-h-[32px]">
        {PROVENANCE_GUIDE.title}
      </summary>
      <div className="mb-3 space-y-2 rounded-xl border bg-card p-3">
        <p>{PROVENANCE_GUIDE.intro}</p>
        <dl className="space-y-2">
          {PROVENANCE_ORDER.map((provenance) => (
            <div key={provenance} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
              <dt className="shrink-0 sm:w-28">
                <ProvenanceChip provenance={provenance} />
              </dt>
              <dd>{PROVENANCE_DESCRIPTION[provenance]}</dd>
            </div>
          ))}
        </dl>
        <p>{PROVENANCE_GUIDE.untagged}</p>
      </div>
    </details>
  );
}
