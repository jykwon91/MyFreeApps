import CharacterRowSkeletons from "@/games/wow-forever/components/character/CharacterRowSkeletons";

const TREE_CHIPS = 3;
const TALENT_ROWS = 6;

/** The talents section's shape while it loads: the point split, the link, then talent rows. */
export default function CharacterTalentsSkeleton() {
  return (
    <div className="space-y-3" aria-hidden data-testid="character-talents-skeleton">
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: TREE_CHIPS }, (_, i) => (
          <div key={i} className="h-8 w-28 rounded-full bg-muted/40 animate-pulse" />
        ))}
        <div className="h-11 w-48 rounded-md bg-muted/40 animate-pulse sm:ml-auto" />
      </div>
      <div className="h-5 w-40 rounded-md bg-muted/40 animate-pulse" />
      <CharacterRowSkeletons count={TALENT_ROWS} height="h-[62px]" />
    </div>
  );
}
