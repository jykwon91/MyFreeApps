import CharacterGear from "@/games/wow-forever/components/character/CharacterGear";
import CharacterHeader from "@/games/wow-forever/components/character/CharacterHeader";
import CharacterSheetSkeleton from "@/games/wow-forever/components/character/CharacterSheetSkeleton";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { characterLookupProblem } from "@/games/wow-forever/lib/character/characterLookupProblem";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

interface CharacterSheetProps {
  slug: string | null;
  rawSlug: string | undefined;
  shown: CharacterResponse | undefined;
  error: unknown;
  isFetching: boolean;
}

/** What sits under the lookup: a prompt, the sheet, its skeleton, or why Blizzard couldn't give it. */
export default function CharacterSheet({ slug, rawSlug, shown, error, isFetching }: CharacterSheetProps) {
  if (!rawSlug) return <EmptyStateNote message="Type your character's first name and surname to see them in their gear." />;
  if (slug === null) return <EmptyStateNote message={characterLookupProblem({ status: 400 })} />;
  if (shown) {
    return (
      <>
        <CharacterHeader character={shown} />
        <CharacterGear character={shown} />
      </>
    );
  }
  if (isFetching) return <CharacterSheetSkeleton />;
  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-destructive/40 bg-card p-4 text-sm">
        {characterLookupProblem(error)}
      </p>
    );
  }
  return <CharacterSheetSkeleton />;
}
