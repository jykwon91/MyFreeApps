import CharacterRowSkeletons from "@/games/wow-forever/components/character/CharacterRowSkeletons";
import CharacterTalentsSkeleton from "@/games/wow-forever/components/character/CharacterTalentsSkeleton";

const SIDE_ROWS = 8;
const WEAPON_ROWS = 3;
const STAT_ROWS = 7;
const STAT_TAB_ROWS = 6;

/** The character sheet's shape while Blizzard answers: header, picture between two slot columns, weapons, stats, talents. */
export default function CharacterSheetSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading the character" data-testid="character-sheet-skeleton">
      <div className="space-y-2" aria-hidden>
        <div className="h-7 w-48 rounded-md bg-muted/40 animate-pulse" />
        <div className="h-5 w-64 rounded-md bg-muted/40 animate-pulse" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem_minmax(0,1fr)]" aria-hidden>
        <div className="h-72 rounded-xl bg-muted/40 animate-pulse sm:h-96 lg:order-2" />
        <div className="lg:order-1">
          <CharacterRowSkeletons count={SIDE_ROWS} />
        </div>
        <div className="lg:order-3">
          <CharacterRowSkeletons count={SIDE_ROWS} />
        </div>
      </div>
      <div className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0 lg:grid-cols-3" aria-hidden>
        {Array.from({ length: WEAPON_ROWS }, (_, i) => (
          <div key={i} className="h-[52px] rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
      <div className="space-y-3" aria-hidden>
        <div className="h-7 w-24 rounded-md bg-muted/40 animate-pulse" />
        <div className="grid gap-3 md:grid-cols-2">
          <CharacterRowSkeletons count={STAT_ROWS} height="h-11" />
          <div className="space-y-2">
            <div className="h-[52px] rounded-lg bg-muted/40 animate-pulse" />
            <CharacterRowSkeletons count={STAT_TAB_ROWS} height="h-11" />
          </div>
        </div>
        <div className="h-[62px] rounded-xl bg-muted/40 animate-pulse" />
        <div className="h-4 w-3/4 rounded-md bg-muted/40 animate-pulse" />
      </div>
      <div className="space-y-3" aria-hidden>
        <div className="h-7 w-24 rounded-md bg-muted/40 animate-pulse" />
        <CharacterTalentsSkeleton />
      </div>
    </div>
  );
}
