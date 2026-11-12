import CharacterCollectibleItems from "@/games/wow-forever/components/character/CharacterCollectibleItems";
import type { CharacterCollectible } from "@/games/wow-forever/types/character/characterCollectible";

interface CharacterCollectibleListProps {
  title: string;
  items: CharacterCollectible[] | null;
  emptyNote: string;
  testId: string;
}

/** One heading and its names: "Mounts (2)". */
export default function CharacterCollectibleList(props: CharacterCollectibleListProps) {
  const { title, items, testId } = props;
  return (
    <div className="space-y-2" data-testid={testId}>
      <h3 className="text-sm font-semibold">
        {title}
        {items !== null && <span className="font-normal text-muted-foreground"> ({items.length})</span>}
      </h3>
      <CharacterCollectibleItems {...props} />
    </div>
  );
}
