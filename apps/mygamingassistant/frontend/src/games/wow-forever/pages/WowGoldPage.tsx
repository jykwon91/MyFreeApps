import { AlertBox } from "@platform/ui";
import GoldBandSection from "@/games/wow-forever/components/gold/GoldBandSection";
import GoldClassSection from "@/games/wow-forever/components/gold/GoldClassSection";
import GoldDontDoSection from "@/games/wow-forever/components/gold/GoldDontDoSection";
import GoldGatheringSection from "@/games/wow-forever/components/gold/GoldGatheringSection";
import GoldSellSection from "@/games/wow-forever/components/gold/GoldSellSection";
import GuideSectionNav from "@/games/wow-forever/components/guide/GuideSectionNav";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { GOLD_DATA_STATUS } from "@/games/wow-forever/data/gold/goldTips";
import { useGoldBand } from "@/games/wow-forever/hooks/useGoldBand";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";

const SECTIONS = [
  { id: "now", label: "Right now" },
  { id: "class", label: "Your class" },
  { id: "gathering", label: "Gathering" },
  { id: "sell", label: "Sell or vendor" },
  { id: "dont", label: "Things not to do" },
] as const;

/** /wow-forever/gold — how to make gold while leveling, by level and class. */
export default function WowGoldPage() {
  const [player] = usePlayerSettings();
  const [band, setBand] = useGoldBand(player.level);
  return (
    <main className="p-4 sm:p-8 space-y-8 max-w-4xl">
      <WowPageHeader
        title="Making gold"
        subtitle={`${GOLD_DATA_STATUS.stage} · checked ${GOLD_DATA_STATUS.checkedOn}`}
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <AlertBox variant="info">
        No prices here: Forever's economy starts fresh at launch, so what sells for how much isn't known yet. Tips
        are from Classic unless marked <span className="font-medium">Forever</span> (published for Forever) or{" "}
        <span className="font-medium">Unconfirmed</span> (not known yet).
      </AlertBox>
      <GuideSectionNav sections={SECTIONS} />
      <GoldBandSection band={band} onBandChange={setBand} />
      <GoldClassSection classId={player.classId} />
      <GoldGatheringSection />
      <GoldSellSection />
      <GoldDontDoSection />
    </main>
  );
}
