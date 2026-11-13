import { useMemo } from "react";
import AbilitiesSection from "@/games/wow-forever/components/hunterPets/AbilitiesSection";
import BeastsSection from "@/games/wow-forever/components/hunterPets/BeastsSection";
import FamiliesSection from "@/games/wow-forever/components/hunterPets/FamiliesSection";
import { useBeastFilters } from "@/games/wow-forever/hooks/useBeastFilters";
import { teachersBySpell } from "@/games/wow-forever/lib/hunterPets/teachersBySpell";
import type { HunterPetsData } from "@/games/wow-forever/types/hunterPets/hunterPetsData";

/** The loaded guide: families, abilities and beasts, tied together by the family choice in the URL. */
export default function HunterPetsContent({ data }: { data: HunterPetsData }) {
  const { filters, update } = useBeastFilters();
  const teachers = useMemo(() => teachersBySpell(data.beasts), [data.beasts]);
  const family = data.families.find((f) => f.slug === filters.family);
  const abilities = family ? data.abilities.filter((a) => a.familyIds.includes(family.id)) : data.abilities;
  return (
    <div className="space-y-8">
      <FamiliesSection
        families={data.families}
        abilities={data.abilities}
        selectedSlug={family?.slug ?? null}
        onSelect={(slug) => update({ family: slug })}
      />
      <AbilitiesSection
        abilities={abilities}
        families={data.families}
        familyName={family?.name ?? null}
        teachersBySpell={teachers}
      />
      <BeastsSection data={data} filters={filters} onChange={update} />
    </div>
  );
}
