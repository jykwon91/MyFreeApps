import CharacterTalentSplit from "@/games/wow-forever/components/character/CharacterTalentSplit";
import CharacterTalentTree from "@/games/wow-forever/components/character/CharacterTalentTree";
import CharacterTalentsCalculatorLink from "@/games/wow-forever/components/character/CharacterTalentsCalculatorLink";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import {
  calculatorLink,
  characterTalentSet,
  formatUnknownTalents,
  treesByPoints,
  unspentPoints,
} from "@/games/wow-forever/lib/character/characterTalents";
import { formatPoints } from "@/games/wow-forever/lib/talents/formatPoints";
import { totalPoints } from "@/games/wow-forever/lib/talents/talentRules";
import type { CharacterTalentGroup } from "@/games/wow-forever/types/character/characterTalentGroup";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

interface CharacterTalentSetBodyProps {
  classId: WowClassId;
  trees: readonly TalentTree[];
  group: CharacterTalentGroup;
  level: number;
  label: string | null;
}

/** A saved set read against the class's loaded trees. */
export default function CharacterTalentSetBody({ classId, trees, group, level, label }: CharacterTalentSetBodyProps) {
  const set = characterTalentSet(trees, group.picks);
  const unspent = group.active ? unspentPoints(set.build, level) : 0;
  const empty = totalPoints(set.build) === 0 && set.unknown === 0;
  return (
    <div className="space-y-3" data-testid="character-talent-set">
      {label && <h3 className="text-base font-semibold">{label}</h3>}
      <div className="flex flex-wrap items-center gap-2">
        <CharacterTalentSplit trees={set.trees} />
        <CharacterTalentsCalculatorLink link={calculatorLink(classId, trees, set, level)} />
      </div>
      {empty && <p className="text-sm text-muted-foreground">No points spent in this set yet.</p>}
      {unspent > 0 && (
        <p className="text-sm" data-testid="character-talents-unspent">
          {formatPoints(unspent)} not spent yet.
        </p>
      )}
      {!empty &&
        treesByPoints(set.trees).map((tree) => <CharacterTalentTree key={tree.name} tree={tree} nested={label !== null} />)}
      {set.unknown > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="character-talents-unknown">
          {formatUnknownTalents(set.unknown)} in our copy of the trees yet.
        </p>
      )}
    </div>
  );
}
