import { useMemo } from "react";
import DownrankFormulaNote from "@/games/wow-forever/components/downrank/DownrankFormulaNote";
import DownrankInputs from "@/games/wow-forever/components/downrank/DownrankInputs";
import DownrankRankCards from "@/games/wow-forever/components/downrank/DownrankRankCards";
import DownrankRankTable from "@/games/wow-forever/components/downrank/DownrankRankTable";
import DownrankSpellHeading from "@/games/wow-forever/components/downrank/DownrankSpellHeading";
import DownrankSuggestions from "@/games/wow-forever/components/downrank/DownrankSuggestions";
import { DOWNRANK_AMOUNT_WORD } from "@/games/wow-forever/data/downrank/downrankLabels";
import { useDownrankSettings } from "@/games/wow-forever/hooks/useDownrankSettings";
import { bestRanks, downrankRows } from "@/games/wow-forever/lib/downrank/downrankMath";
import type { DownrankFamily } from "@/games/wow-forever/types/downrank/downrankFamily";

interface DownrankCalculatorProps {
  families: readonly DownrankFamily[];
}

/** The loaded calculator: inputs, the suggested ranks, how it's worked out, then every rank. */
export default function DownrankCalculator({ families }: DownrankCalculatorProps) {
  const [settings, update] = useDownrankSettings(families);
  const family = families.find((f) => f.id === settings.familyId) ?? families[0];
  const rows = useMemo(() => downrankRows(family.ranks, settings), [family, settings]);
  const best = useMemo(() => bestRanks(rows), [rows]);
  const amountWord = DOWNRANK_AMOUNT_WORD[family.kind];
  return (
    <div className="space-y-4">
      <DownrankInputs families={families} family={family} settings={settings} onChange={update} />
      <DownrankSuggestions spellName={family.name} amountWord={amountWord} best={best} firstLevel={family.ranks[0].level} />
      <DownrankFormulaNote
        kind={family.kind}
        lowLevelPenalty={settings.lowLevelPenalty}
        onLowLevelPenaltyChange={(on) => update({ lowLevelPenalty: on })}
      />
      <section className="space-y-3" aria-label={`${family.name} ranks`}>
        <DownrankSpellHeading family={family} />
        <DownrankRankTable rows={rows} best={best} amountWord={amountWord} />
        <DownrankRankCards rows={rows} best={best} amountWord={amountWord} />
      </section>
    </div>
  );
}
