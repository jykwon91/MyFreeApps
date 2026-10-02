import GoldTipList from "@/games/wow-forever/components/gold/GoldTipList";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import { tipsForLevel } from "@/games/wow-forever/data/gold/goldTips";

interface GoldPlanSectionProps {
  level: number | null;
}

/** The routine for your level: three steps first, then the rest. */
export default function GoldPlanSection({ level }: GoldPlanSectionProps) {
  const band = tipsForLevel(level);
  return (
    <GuideSection id="now" title={`Your plan for ${band.label.toLowerCase()}`}>
      <GoldTipList tips={band.top} numbered />
      <details className="rounded-lg border bg-card p-3">
        <summary className="cursor-pointer text-sm font-medium min-h-[44px] sm:min-h-0 flex items-center">
          {band.more.length} more for {band.label.toLowerCase()}
        </summary>
        <div className="pt-3">
          <GoldTipList tips={band.more} />
        </div>
      </details>
    </GuideSection>
  );
}
