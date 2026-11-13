import AbilityCard from "@/games/wow-forever/components/hunterPets/AbilityCard";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import GuideSection from "@/games/wow-forever/components/shared/GuideSection";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { HUNTER_PETS_EMPTY } from "@/games/wow-forever/data/hunterPets/hunterPetsConfig";
import type { HunterFamily } from "@/games/wow-forever/types/hunterPets/hunterFamily";
import type { PetAbility } from "@/games/wow-forever/types/hunterPets/petAbility";
import type { TamableBeast } from "@/games/wow-forever/types/hunterPets/tamableBeast";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface AbilitiesSectionProps {
  abilities: readonly PetAbility[];
  families: readonly HunterFamily[];
  familyName: string | null;
  teachersBySpell: ReadonlyMap<number, readonly TamableBeast[]>;
}

/** The abilities (of the picked family, if any) with their ranks and teachers. */
export default function AbilitiesSection({ abilities, families, familyName, teachersBySpell }: AbilitiesSectionProps) {
  return (
    <GuideSection
      id="abilities"
      title={familyName ? `${familyName} abilities` : "Pet abilities"}
      intro="Open an ability to see each rank, the pet level it is learned at and the beasts that teach it."
    >
      <p className="text-sm">
        <ProvenanceBadge provenance={PROVENANCE.client} />
      </p>
      {abilities.length === 0 ? (
        <EmptyStateNote message={HUNTER_PETS_EMPTY.noAbilities} />
      ) : (
        <div className="space-y-2">
          {abilities.map((ability) => (
            <AbilityCard
              key={ability.slug}
              ability={ability}
              families={families}
              teachersBySpell={teachersBySpell}
            />
          ))}
        </div>
      )}
    </GuideSection>
  );
}
