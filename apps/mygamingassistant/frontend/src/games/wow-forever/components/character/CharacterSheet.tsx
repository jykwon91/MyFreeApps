import CharacterGear from "@/games/wow-forever/components/character/CharacterGear";
import CharacterHeader from "@/games/wow-forever/components/character/CharacterHeader";
import CharacterDungeonsPanel from "@/games/wow-forever/components/character/CharacterDungeonsPanel";
import CharacterCollectionsPanel from "@/games/wow-forever/components/character/CharacterCollectionsPanel";
import CharacterProfessionsPanel from "@/games/wow-forever/components/character/CharacterProfessionsPanel";
import CharacterPvpPanel from "@/games/wow-forever/components/character/CharacterPvpPanel";
import CharacterReputationPanel from "@/games/wow-forever/components/character/CharacterReputationPanel";
import CharacterStatsPanel from "@/games/wow-forever/components/character/CharacterStatsPanel";
import CharacterTalentsPanel from "@/games/wow-forever/components/character/CharacterTalentsPanel";
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
        <CharacterStatsPanel character={shown} />
        {/* Keyed by character so another lookup starts with every profession closed. */}
        <CharacterProfessionsPanel key={shown.slug} character={shown} />
        {/* Keyed likewise, so another lookup opens its own first group. */}
        <CharacterReputationPanel key={`reputation-${shown.slug}`} character={shown} />
        <CharacterTalentsPanel character={shown} />
        {/* Keyed so another lookup starts open again. */}
        <CharacterDungeonsPanel key={`dungeons-${shown.slug}`} character={shown} />
        {/* Keyed so another lookup starts closed. */}
        <CharacterPvpPanel key={`pvp-${shown.slug}`} character={shown} />
        <CharacterCollectionsPanel key={`collections-${shown.slug}`} character={shown} />
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
