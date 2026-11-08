import FamilyCard from "@/games/wow-forever/components/hunterPets/FamilyCard";
import GuideSection from "@/games/wow-forever/components/shared/GuideSection";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import type { HunterFamily } from "@/games/wow-forever/types/hunterPets/hunterFamily";
import type { PetAbility } from "@/games/wow-forever/types/hunterPets/petAbility";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface FamiliesSectionProps {
  families: readonly HunterFamily[];
  abilities: readonly PetAbility[];
  selectedSlug: string | null;
  onSelect: (slug: string | null) => void;
}

/** Every family; the picked one narrows the abilities and beasts below. */
export default function FamiliesSection({ families, abilities, selectedSlug, onSelect }: FamiliesSectionProps) {
  return (
    <GuideSection
      id="families"
      title="Pet families"
      intro="Pick a family to see only its abilities and beasts. Modifiers are the family's damage, armor and health compared with the base pet."
    >
      <p className="text-sm">
        <ProvenanceBadge provenance={PROVENANCE.client} />
      </p>
      <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
        {families.map((family) => (
          <li key={family.id}>
            <FamilyCard
              family={family}
              selected={family.slug === selectedSlug}
              abilityCount={abilities.filter((a) => a.familyIds.includes(family.id)).length}
              onToggle={() => onSelect(family.slug === selectedSlug ? null : family.slug)}
            />
          </li>
        ))}
      </ul>
    </GuideSection>
  );
}
