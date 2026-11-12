import clsx from "clsx";
import { useState } from "react";
import CharacterTalentDetails from "@/games/wow-forever/components/character/CharacterTalentDetails";
import CharacterTalentSplit from "@/games/wow-forever/components/character/CharacterTalentSplit";
import CharacterTalentTreeView from "@/games/wow-forever/components/character/CharacterTalentTreeView";
import CharacterTalentsCalculatorLink from "@/games/wow-forever/components/character/CharacterTalentsCalculatorLink";
import TalentTreeTabs from "@/games/wow-forever/components/talents/TalentTreeTabs";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import {
  calculatorLink,
  characterTalentSet,
  formatUnknownTalents,
  pickedTalent,
  unspentPoints,
} from "@/games/wow-forever/lib/character/characterTalents";
import { formatPoints } from "@/games/wow-forever/lib/talents/formatPoints";
import { mainTree } from "@/games/wow-forever/lib/talents/mainTree";
import { totalPoints } from "@/games/wow-forever/lib/talents/talentRules";
import type { CharacterTalentGroup } from "@/games/wow-forever/types/character/characterTalentGroup";
import type { TalentPosition } from "@/games/wow-forever/types/talents/talentPosition";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

interface CharacterTalentSetBodyProps {
  classId: WowClassId;
  trees: readonly TalentTree[];
  group: CharacterTalentGroup;
  level: number;
  label: string | null;
}

/**
 * A saved set drawn as the game's talent frame, read only: the three trees
 * side by side (one at a time behind tabs on a phone, opening on the main
 * tree), with the opened talent's text under them.
 */
export default function CharacterTalentSetBody({ classId, trees, group, level, label }: CharacterTalentSetBodyProps) {
  const set = characterTalentSet(trees, group.picks);
  const [activeTree, setActiveTree] = useState(() => mainTree(set.build));
  const [picked, setPicked] = useState<TalentPosition | null>(null);
  const unspent = group.active ? unspentPoints(set.build, level) : 0;
  const empty = totalPoints(set.build) === 0 && set.unknown === 0;

  function toggle(tree: number, talent: number) {
    if (picked?.tree === tree && picked.talent === talent) {
      setPicked(null);
      return;
    }
    setPicked({ tree, talent });
  }

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
      <TalentTreeTabs trees={trees} build={set.build} active={activeTree} onChange={setActiveTree} />
      <div className="grid gap-4 lg:grid-cols-3">
        {trees.map((tree, t) => (
          <div key={tree.id} className={clsx(t !== activeTree && "hidden lg:block")}>
            <CharacterTalentTreeView
              trees={trees}
              treeIndex={t}
              build={set.build}
              level={level}
              heading={label ? "h4" : "h3"}
              selected={picked?.tree === t ? picked.talent : null}
              onToggle={(talent) => toggle(t, talent)}
              onClear={() => setPicked(null)}
            />
          </div>
        ))}
      </div>
      <CharacterTalentDetails picked={pickedTalent(trees, set.build, picked)} />
      {set.unknown > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="character-talents-unknown">
          {formatUnknownTalents(set.unknown)} in our copy of the trees yet.
        </p>
      )}
    </div>
  );
}
