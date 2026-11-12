import CharacterCollapsibleSection from "@/games/wow-forever/components/character/CharacterCollapsibleSection";
import CharacterCollectibleList from "@/games/wow-forever/components/character/CharacterCollectibleList";
import { MOUNTS_NONE_NOTE, PETS_NONE_NOTE } from "@/games/wow-forever/data/character/characterCollectionsConfig";
import { collectionsSummary } from "@/games/wow-forever/lib/character/characterCollections";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

/** The character's mounts and pets, by name. Starts closed. */
export default function CharacterCollectionsPanel({ character }: { character: CharacterResponse }) {
  const { mounts, pets } = character.collections;
  return (
    <CharacterCollapsibleSection
      title="Collections"
      summary={collectionsSummary(character.collections)}
      defaultOpen={false}
      testId="character-collections"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <CharacterCollectibleList title="Mounts" items={mounts} emptyNote={MOUNTS_NONE_NOTE} testId="character-mounts" />
        <CharacterCollectibleList title="Pets" items={pets} emptyNote={PETS_NONE_NOTE} testId="character-pets" />
      </div>
    </CharacterCollapsibleSection>
  );
}
