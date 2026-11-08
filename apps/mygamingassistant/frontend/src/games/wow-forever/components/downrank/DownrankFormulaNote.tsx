import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { DOWNRANK_AMOUNT_WORD, DOWNRANK_PROVENANCE_DETAIL } from "@/games/wow-forever/data/downrank/downrankLabels";
import type { DownrankKind } from "@/games/wow-forever/types/downrank/downrankKind";

interface DownrankFormulaNoteProps {
  kind: DownrankKind;
  lowLevelPenalty: boolean;
  onLowLevelPenaltyChange: (on: boolean) => void;
}

/** How the numbers are worked out, in plain words, with where each part comes from. */
export default function DownrankFormulaNote({ kind, lowLevelPenalty, onLowLevelPenaltyChange }: DownrankFormulaNoteProps) {
  const word = DOWNRANK_AMOUNT_WORD[kind];
  return (
    <section className="rounded-xl border bg-card p-3 sm:p-4 space-y-2 text-sm" aria-labelledby="downrank-formula-title">
      <h2 id="downrank-formula-title" className="font-semibold">How it&apos;s worked out</h2>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          Each rank adds a share of your bonus {word}: longer casts get more (a 3.5 sec cast gets all of it, a
          1.5 sec cast under half), and {word} over time gets its own share.{" "}
          <ProvenanceBadge provenance="client" detail={DOWNRANK_PROVENANCE_DETAIL.gameFiles} />
        </li>
        <li>
          A rank learned before level 20 gets less: 3.75% less share for every level below 20 it&apos;s learned at.{" "}
          <ProvenanceBadge provenance="classic" detail={DOWNRANK_PROVENANCE_DETAIL.classicRules} />{" "}
          <ProvenanceBadge provenance="unconfirmed" detail={DOWNRANK_PROVENANCE_DETAIL.lowLevel} />
        </li>
        <li>
          Once you&apos;re more than 5 levels past a rank&apos;s max level, it gets (max level + 5) ÷ your level of
          its share — the lower the rank, the less your gear helps it.{" "}
          <ProvenanceBadge provenance="classic" detail={DOWNRANK_PROVENANCE_DETAIL.classicRules} />
        </li>
        <li>
          Per second is the {word} over the cast time (never under the 1.5 sec global cooldown), or over the
          whole duration for a spell that only ticks.
        </li>
      </ul>
      <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
        <input
          type="checkbox"
          checked={lowLevelPenalty}
          onChange={(e) => onLowLevelPenaltyChange(e.target.checked)}
          className="h-5 w-5"
        />
        <span>Apply the below-level-20 penalty</span>
      </label>
    </section>
  );
}
