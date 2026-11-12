import CharacterSectionNote from "@/games/wow-forever/components/character/CharacterSectionNote";
import { COLLECTION_FAILED_NOTE } from "@/games/wow-forever/data/character/characterCollectionsConfig";
import { collectibleLabel } from "@/games/wow-forever/lib/character/characterCollections";
import type { CharacterCollectible } from "@/games/wow-forever/types/character/characterCollectible";

interface CharacterCollectibleItemsProps {
  title: string;
  items: CharacterCollectible[] | null;
  emptyNote: string;
  testId: string;
}

/** A collection's names, or why there are none. */
export default function CharacterCollectibleItems({ title, items, emptyNote, testId }: CharacterCollectibleItemsProps) {
  if (items === null) return <CharacterSectionNote testId={`${testId}-note`}>{COLLECTION_FAILED_NOTE}</CharacterSectionNote>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{emptyNote}</p>;
  return (
    <ul aria-label={title} className="space-y-1 text-sm">
      {items.map((item) => (
        <li key={item.id} className="py-1">
          {collectibleLabel(item)}
        </li>
      ))}
    </ul>
  );
}
