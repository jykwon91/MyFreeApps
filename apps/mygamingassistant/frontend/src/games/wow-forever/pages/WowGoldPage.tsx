import { useState } from "react";
import { AlertBox } from "@platform/ui";
import GoldClassSection from "@/games/wow-forever/components/gold/GoldClassSection";
import GoldDontDoSection from "@/games/wow-forever/components/gold/GoldDontDoSection";
import GoldFarmSection from "@/games/wow-forever/components/gold/GoldFarmSection";
import GoldGatheringSection from "@/games/wow-forever/components/gold/GoldGatheringSection";
import GoldPlanSection from "@/games/wow-forever/components/gold/GoldPlanSection";
import GoldSellSection from "@/games/wow-forever/components/gold/GoldSellSection";
import GuideSectionNav from "@/games/wow-forever/components/shared/GuideSectionNav";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { GOLD_DATA_STATUS } from "@/games/wow-forever/data/gold/goldTips";
import LevelCapNote from "@/games/wow-forever/components/shared/LevelCapNote";
import { levelCap, playerLevel } from "@/games/wow-forever/data/levelCap";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";

const SECTIONS = [
  { id: "now", label: "Your plan" },
  { id: "farm", label: "Where to farm" },
  { id: "class", label: "Your class" },
  { id: "gathering", label: "Gathering" },
  { id: "sell", label: "Keep or vendor" },
  { id: "dont", label: "Things not to do" },
] as const;

/** /wow-forever/gold — how to make gold while leveling: a plan, where to farm, and what to keep. */
export default function WowGoldPage() {
  const [player, updatePlayer] = usePlayerSettings();
  const [showAllClasses, setShowAllClasses] = useState(false);
  return (
    <main className="p-4 sm:p-8 space-y-8 max-w-4xl">
      <WowPageHeader
        title="Making gold"
        subtitle={`${GOLD_DATA_STATUS.summary} · checked ${GOLD_DATA_STATUS.checkedOn}`}
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <AlertBox variant="info">
        Gold figures are vendor prices from Classic's loot tables — the floor. Cloth and leather on the farm cards
        also show your faction's auction-house price, when someone is selling them. The "Sell" tips are advice, not prices.
      </AlertBox>
      <div className="space-y-1">
        <NumberField
          label="Your level"
          value={player.level}
          min={1}
          max={levelCap()}
          onChange={(level) => updatePlayer({ level: playerLevel(level) })}
          className="flex flex-col gap-1 w-32"
        />
        <LevelCapNote />
      </div>
      <GuideSectionNav sections={SECTIONS} />
      <GoldPlanSection level={player.level} />
      <GoldFarmSection level={player.level} />
      <GoldClassSection
        classId={player.classId}
        showAll={showAllClasses}
        onClassChange={(classId) => {
          setShowAllClasses(false);
          updatePlayer({ classId });
        }}
        onShowAll={() => setShowAllClasses(true)}
      />
      <GoldGatheringSection />
      <GoldSellSection />
      <GoldDontDoSection />
    </main>
  );
}
