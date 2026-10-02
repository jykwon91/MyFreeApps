import { useMemo, useState } from "react";
import GoldFarmCard from "@/games/wow-forever/components/gold/GoldFarmCard";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import {
  FARM_SORT,
  farmsFor,
  goldFarms,
  LEVELS_ABOVE,
  LEVELS_BELOW,
  type FarmSort,
} from "@/games/wow-forever/gold/goldFarms";

const SORT_OPTIONS: readonly { id: FarmSort; label: string }[] = [
  { id: FARM_SORT.gold, label: "Most gold" },
  { id: FARM_SORT.cloth, label: "Most cloth" },
];

interface GoldFarmSectionProps {
  level: number | null;
}

/** The best mobs to farm at your level, worked out from Classic's loot tables. */
export default function GoldFarmSection({ level }: GoldFarmSectionProps) {
  const [skinning, setSkinning] = useState(false);
  const [sort, setSort] = useState<FarmSort>(FARM_SORT.gold);
  const farms = useMemo(
    () => (level === null ? [] : farmsFor(goldFarms(), level, { skinning, sort })),
    [level, skinning, sort],
  );
  return (
    <GuideSection
      id="farm"
      title="Where to farm at your level"
      intro="When you'd rather make gold than quest: go to the top spot, kill and loot everything, and vendor what isn't cloth, leather or a green."
    >
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedToggle label="Sort farm spots" options={SORT_OPTIONS} value={sort} onChange={setSort} />
        <label className="inline-flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" checked={skinning} onChange={(e) => setSkinning(e.target.checked)} className="h-4 w-4" />
          I have Skinning
        </label>
      </div>
      {level === null ? (
        <p className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
          Enter your level at the top of the page to see where to farm.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Mobs from level {Math.max(1, level - LEVELS_BELOW)} to {level + LEVELS_ABOVE}. Gold an hour counts coin and what the loot sells to a vendor
            for, at up to 60 kills an hour (fewer when the camp respawns slower than you kill). Casters and hunters often
            manage more, warriors and rogues less. Classic loot tables — Forever may change drops, and its new zones aren't
            listed.
          </p>
          <ol className="space-y-3 list-none">
            {farms.map((farm, i) => (
              <GoldFarmCard key={farm.npcId} farm={farm} rank={i + 1} skinning={skinning} />
            ))}
          </ol>
        </>
      )}
    </GuideSection>
  );
}
