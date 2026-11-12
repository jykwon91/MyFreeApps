import { Link } from "react-router-dom";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import CharacterTalentSplit from "@/games/wow-forever/components/character/CharacterTalentSplit";
import CharacterTalentTree from "@/games/wow-forever/components/character/CharacterTalentTree";
import CharacterTalentsSkeleton from "@/games/wow-forever/components/character/CharacterTalentsSkeleton";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { useTalentClass } from "@/games/wow-forever/hooks/useTalentClass";
import {
  calculatorHref,
  characterTalentSet,
  treesByPoints,
  unspentPoints,
} from "@/games/wow-forever/lib/character/characterTalents";
import { formatPoints } from "@/games/wow-forever/lib/talents/formatPoints";
import type { CharacterTalentGroup } from "@/games/wow-forever/types/character/characterTalentGroup";

interface CharacterTalentSetViewProps {
  classId: WowClassId;
  group: CharacterTalentGroup;
  level: number;
  /** "Active" / "Other saved set" when the character has more than one; null otherwise. */
  label: string | null;
}

/** One saved set read against MGA's copy of the class's trees, with a link to open it in the talent calculator. */
export default function CharacterTalentSetView({ classId, group, level, label }: CharacterTalentSetViewProps) {
  const state = useTalentClass(classId);
  if (state.status === "loading") return <CharacterTalentsSkeleton />;
  if (state.status === "error") {
    return <LoadErrorRetry message="Couldn't load the talent trees." onRetry={state.retry} retrying={state.retrying} />;
  }
  const { trees } = state.data;
  const set = characterTalentSet(trees, group.picks);
  const href = calculatorHref(classId, trees, set.build, level);
  const unspent = group.active ? unspentPoints(set.build, level) : 0;
  return (
    <div className="space-y-3" data-testid="character-talent-set">
      {label ? <h3 className="text-base font-semibold">{label}</h3> : null}
      <div className="flex flex-wrap items-center gap-2">
        <CharacterTalentSplit trees={set.trees} />
        {href ? (
          <Link
            to={href}
            className="inline-flex min-h-[44px] items-center rounded-md border px-3 text-sm font-medium hover:bg-muted sm:ml-auto"
            data-testid="character-talents-calculator-link"
          >
            Open in the talent calculator
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground sm:ml-auto" data-testid="character-talents-no-link">
            The talent calculator can&apos;t open this build: it has points the calculator doesn&apos;t allow.
          </p>
        )}
      </div>
      {unspent > 0 ? (
        <p className="text-sm" data-testid="character-talents-unspent">
          {formatPoints(unspent)} not spent yet.
        </p>
      ) : null}
      {treesByPoints(set.trees).map((tree) => (
        <CharacterTalentTree key={tree.name} tree={tree} />
      ))}
      {set.unknown > 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="character-talents-unknown">
          {set.unknown === 1 ? "1 talent isn't" : `${set.unknown} talents aren't`} in our copy of the trees yet.
        </p>
      ) : null}
    </div>
  );
}
