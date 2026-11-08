import RacialCompare from "@/games/wow-forever/components/races/RacialCompare";
import RacialStatusChip from "@/games/wow-forever/components/races/RacialStatusChip";
import RacialVariantLines from "@/games/wow-forever/components/races/RacialVariantLines";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { RACES_TEXT, RACIAL_KIND_LABEL, RACIAL_STATUS } from "@/games/wow-forever/data/races/racesConfig";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { Racial } from "@/games/wow-forever/types/races/racial";

/** One racial: icon, name (its own anchor), Active/Passive, status, then its text — or Classic's next to Forever's when it changed. */
export default function RacialRow({ racial }: { racial: Racial }) {
  const removed = racial.status === RACIAL_STATUS.removed;
  const compare = racial.status === RACIAL_STATUS.changed && racial.classicVariants !== null;
  return (
    <li id={racial.key} className="scroll-mt-4 space-y-2 border-t pt-3 first:border-t-0 first:pt-0" data-testid="racial-row">
      <div className="flex items-start gap-3">
        <GameIcon icon={fileIcon(racial.icon)} size={32} alt="" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <a href={`#${racial.key}`} className="font-medium hover:underline" data-testid="racial-anchor">
              {racial.name}
            </a>
            <span className="rounded border px-1.5 text-xs text-muted-foreground">{RACIAL_KIND_LABEL[racial.kind]}</span>
            <RacialStatusChip status={racial.status} />
          </div>
          {racial.wasName ? <p className="text-xs text-muted-foreground">Was: {racial.wasName}</p> : null}
        </div>
      </div>
      <div className="space-y-2 text-sm">
        {compare && racial.classicVariants ? (
          <RacialCompare classic={racial.classicVariants} forever={racial.variants} />
        ) : null}
        {!compare && !removed ? (
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <RacialVariantLines variants={racial.variants} />
            </div>
            <ProvenanceBadge provenance={PROVENANCE.client} />
          </div>
        ) : null}
        {removed && racial.classicVariants ? (
          <div className="flex flex-wrap items-start gap-2 text-muted-foreground">
            <div className="min-w-0 flex-1">
              <RacialVariantLines variants={racial.classicVariants} />
            </div>
            <ProvenanceBadge provenance={PROVENANCE.classic} />
          </div>
        ) : null}
        {racial.partial ? (
          <p className="text-xs text-muted-foreground" data-testid="racial-partial">
            {RACES_TEXT.unknownValue}
          </p>
        ) : null}
      </div>
    </li>
  );
}
