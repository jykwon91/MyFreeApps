import GoldTipList from "@/games/wow-forever/components/gold/GoldTipList";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { BAND_TIPS } from "@/games/wow-forever/data/gold/goldTips";
import { GOLD_BAND, type GoldBand } from "@/games/wow-forever/data/gold/goldTypes";

const BAND_OPTIONS: readonly { id: GoldBand; label: string }[] = [
  { id: GOLD_BAND.early, label: "1–20" },
  { id: GOLD_BAND.mid, label: "20–40" },
  { id: GOLD_BAND.late, label: "40–60" },
  { id: GOLD_BAND.all, label: "All" },
];

interface GoldBandSectionProps {
  band: GoldBand;
  onBandChange: (band: GoldBand) => void;
}

/** "Right now": the three things to do at your level, then the rest for that level. */
export default function GoldBandSection({ band, onBandChange }: GoldBandSectionProps) {
  const shown = band === GOLD_BAND.all ? BAND_TIPS : BAND_TIPS.filter((b) => b.band === band);
  return (
    <GuideSection id="now" title="What to do right now" intro="Pick your level — it starts at the level saved on the World Map.">
      <SegmentedToggle label="Your level" options={BAND_OPTIONS} value={band} onChange={onBandChange} />
      {shown.map((b) => (
        <div key={b.band} className="space-y-3">
          {band === GOLD_BAND.all ? <h3 className="font-semibold">{b.label}</h3> : null}
          <GoldTipList tips={b.top} numbered />
          <details className="rounded-lg border bg-card p-3">
            <summary className="cursor-pointer text-sm font-medium min-h-[44px] sm:min-h-0 flex items-center">
              {b.more.length} more for {b.label.toLowerCase()}
            </summary>
            <div className="pt-3">
              <GoldTipList tips={b.more} />
            </div>
          </details>
        </div>
      ))}
    </GuideSection>
  );
}
