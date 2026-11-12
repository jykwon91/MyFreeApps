import { formatCount } from "@/games/wow-forever/lib/character/formatCount";
import type { CharacterCollectible } from "@/games/wow-forever/types/character/characterCollectible";
import type { CharacterCollections } from "@/games/wow-forever/types/character/characterCollections";

function counted(list: CharacterCollectible[] | null, one: string, many: string): string | null {
  if (list === null) return null;
  return formatCount(list.length, one, many);
}

/** The closed section's line: "2 mounts, 4 pets" (a pet learned twice counts once, as in its list); a list Blizzard didn't send is left out. */
export function collectionsSummary(collections: CharacterCollections): string {
  const parts = [counted(collections.mounts, "mount", "mounts"), counted(collections.pets, "pet", "pets")];
  const shown = parts.filter((part): part is string => part !== null);
  if (shown.length === 0) return "Couldn't load";
  return shown.join(", ");
}

/** "Pachimari ×2"; just the name when there's one. */
export function collectibleLabel(item: CharacterCollectible): string {
  if (item.count <= 1) return item.name;
  return `${item.name} ×${item.count}`;
}
