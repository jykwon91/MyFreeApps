import type { Talent } from "@/games/wow-forever/types/talents/talent";
import type { TalentPrereq } from "@/games/wow-forever/types/talents/talentPrereq";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

function talent(id: number, tier: number, column: number, ranks: number, prereqs: TalentPrereq[] = []): Talent {
  return {
    id,
    name: `Talent ${id}`,
    tier,
    column,
    icon: 0,
    ranks: Array.from({ length: ranks }, (_, i) => `Rank ${i + 1} of talent ${id}.`),
    prereqs,
    newInForever: false,
    classicRanks: null,
  };
}

/**
 * Three small trees for the talent-rule tests. Tree 0:
 *   0 (row 1, 5 ranks)   1 (row 1, 5 ranks)
 *   2 (row 2, 3 ranks)   4 (row 2, 2 ranks)
 *   3 (row 3, 1 rank, needs 3 points in talent 2)
 * Trees 1 and 2 have one row-1 talent of 5 ranks each.
 */
export function talentTreesFixture(): TalentTree[] {
  return [
    {
      id: 1,
      name: "First",
      icon: 0,
      talents: [
        talent(10, 0, 0, 5),
        talent(11, 0, 1, 5),
        talent(12, 1, 0, 3),
        talent(13, 2, 0, 1, [{ talentIndex: 2, rank: 3 }]),
        talent(14, 1, 1, 2),
      ],
    },
    { id: 2, name: "Second", icon: 0, talents: [talent(20, 0, 0, 5)] },
    { id: 3, name: "Third", icon: 0, talents: [talent(30, 0, 0, 5)] },
  ];
}
