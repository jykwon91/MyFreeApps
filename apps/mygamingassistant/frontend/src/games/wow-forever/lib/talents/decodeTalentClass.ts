import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { ClassicTalentFile } from "@/games/wow-forever/types/talents/classicTalentFile";
import type { Talent } from "@/games/wow-forever/types/talents/talent";
import type { TalentClassData } from "@/games/wow-forever/types/talents/talentClassData";
import type { TalentFile } from "@/games/wow-forever/types/talents/talentFile";
import type { TalentFileTree } from "@/games/wow-forever/types/talents/talentFileTree";
import type { TalentPrereq } from "@/games/wow-forever/types/talents/talentPrereq";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

function decodeTree(tree: TalentFileTree, classic: ClassicTalentFile): TalentTree {
  const indexOf = new Map(tree.talents.map((t, i) => [t.id, i]));
  const talents: Talent[] = tree.talents.map((t) => ({
    id: t.id,
    name: t.name,
    tier: t.tier,
    column: t.column,
    icon: t.icon,
    ranks: t.ranks,
    prereqs: t.prereqs.flatMap(([id, rank]): TalentPrereq[] => {
      const talentIndex = indexOf.get(id);
      // The generator's test keeps every prerequisite inside its tree; anything else is ignored.
      return talentIndex === undefined ? [] : [{ talentIndex, rank }];
    }),
    classicName: t.classicName === true,
    classicRanks: classic.talents[String(t.id)] ?? null,
    classicFallback: classic.fallback[String(t.id)] ?? null,
  }));
  return { id: tree.id, name: tree.name, icon: tree.icon, talents };
}

/** A class's talent file and its Classic comparison, joined for the calculator. */
export function decodeTalentClass(classId: WowClassId, file: TalentFile, classic: ClassicTalentFile): TalentClassData {
  return {
    classId,
    clientBuild: file.clientBuild,
    trees: file.trees.map((tree) => decodeTree(tree, classic)),
  };
}
