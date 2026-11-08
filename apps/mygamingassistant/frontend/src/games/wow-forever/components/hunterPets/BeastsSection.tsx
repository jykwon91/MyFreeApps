import { useState } from "react";
import BeastFiltersBar from "@/games/wow-forever/components/hunterPets/BeastFiltersBar";
import BeastRow from "@/games/wow-forever/components/hunterPets/BeastRow";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import GuideSection from "@/games/wow-forever/components/shared/GuideSection";
import { BEASTS_PAGE_SIZE, HUNTER_PETS_EMPTY } from "@/games/wow-forever/data/hunterPets/hunterPetsConfig";
import { filterBeasts } from "@/games/wow-forever/lib/hunterPets/filterBeasts";
import type { BeastFilters } from "@/games/wow-forever/types/hunterPets/beastFilters";
import type { HunterPetsData } from "@/games/wow-forever/types/hunterPets/hunterPetsData";

interface BeastsSectionProps {
  data: HunterPetsData;
  filters: BeastFilters;
  onChange: (patch: Partial<BeastFilters>) => void;
}

/** The tamable beasts: search, family and sort, shown a page at a time. */
export default function BeastsSection({ data, filters, onChange }: BeastsSectionProps) {
  const [pages, setPages] = useState(1);
  const matches = filterBeasts(data.beasts, data.families, filters);
  const shown = matches.slice(0, pages * BEASTS_PAGE_SIZE);
  const familyName = new Map(data.families.map((f) => [f.id, f.name]));
  return (
    <GuideSection
      id="beasts"
      title="Tamable beasts"
      intro="Every tamable beast with its level, zones and attack speed, and the ability ranks a hunter's pet learns from it."
    >
      <BeastFiltersBar
        families={data.families}
        filters={filters}
        onChange={(patch) => {
          setPages(1);
          onChange(patch);
        }}
      />
      <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="beast-count">
        {matches.length} of {data.beasts.length} beasts
      </p>
      {matches.length === 0 ? (
        <EmptyStateNote message={HUNTER_PETS_EMPTY.noBeasts} />
      ) : (
        <ul className="space-y-2" aria-label="Tamable beasts">
          {shown.map((beast) => (
            <BeastRow
              key={beast.id}
              beast={beast}
              familyName={familyName.get(beast.familyId) ?? ""}
              seenOn={data.seenOn}
            />
          ))}
        </ul>
      )}
      {shown.length < matches.length ? (
        <button
          type="button"
          onClick={() => setPages((n) => n + 1)}
          className="min-h-[44px] w-full rounded-md border px-3 text-sm hover:bg-muted/40"
          data-testid="beasts-show-more"
        >
          Show more ({matches.length - shown.length} left)
        </button>
      ) : null}
    </GuideSection>
  );
}
