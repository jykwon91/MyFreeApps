import { useState } from "react";
import BeastName from "@/games/wow-forever/components/hunterPets/BeastName";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { HUNTER_PETS_EMPTY, TEACHERS_PREVIEW } from "@/games/wow-forever/data/hunterPets/hunterPetsConfig";
import type { PetAbilityRank } from "@/games/wow-forever/types/hunterPets/petAbilityRank";
import type { TamableBeast } from "@/games/wow-forever/types/hunterPets/tamableBeast";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface AbilityRankRowProps {
  rank: PetAbilityRank;
  /** The ability is new in Forever, so Classic can't say who teaches it. */
  abilityIsNew: boolean;
  teachers: readonly TamableBeast[];
}

/** One rank: learn level, tooltip, new-in-Forever mark and the beasts that teach it. */
export default function AbilityRankRow({ rank, abilityIsNew, teachers }: AbilityRankRowProps) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? teachers : teachers.slice(0, TEACHERS_PREVIEW);
  const unknown = teachers.length === 0 && (abilityIsNew || rank.isNew);
  return (
    <li className="space-y-1 border-t pt-2 first:border-t-0 first:pt-0" data-testid="ability-rank">
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="font-medium">Rank {rank.rank}</span>
        <span className="text-muted-foreground">learned at pet level {rank.level}</span>
        {rank.isNew ? <span className="rounded border px-1.5 text-xs">New in Forever</span> : null}
      </p>
      {rank.text ? <p className="text-sm text-muted-foreground">{rank.text}</p> : null}
      {teachers.length > 0 ? (
        <>
          <ul className="space-y-1 text-sm" aria-label={`Beasts that teach rank ${rank.rank}`}>
            {shown.map((beast) => (
              <li key={beast.id}>
                <BeastName beast={beast} withPlace />
              </li>
            ))}
          </ul>
          {teachers.length > TEACHERS_PREVIEW ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="min-h-[44px] rounded-md border px-3 text-sm hover:bg-muted/40"
            >
              {showAll ? "Show fewer" : `Show all ${teachers.length}`}
            </button>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="no-teachers">
          {unknown ? HUNTER_PETS_EMPTY.teachersUnknown : HUNTER_PETS_EMPTY.noTeachers}{" "}
          {unknown ? <ProvenanceBadge provenance={PROVENANCE.unconfirmed} /> : null}
        </p>
      )}
    </li>
  );
}
