import { useState } from "react";
import BetaZonesCallout from "@/games/wow-forever/components/guide/BetaZonesCallout";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import type { Faction } from "@/games/wow-forever/data/guide/guideTypes";
import { FACTIONS, LEVELING_ZONES } from "@/games/wow-forever/data/guide/levelingZones";

export default function LevelingZonesSection() {
  const [faction, setFaction] = useState<Faction>("alliance");
  return (
    <GuideSection
      id="leveling"
      title="Where to level"
      intro="The Classic Era route by level. Quest in any zone in your band — if quests turn red, move on or come back later."
    >
      <SegmentedToggle label="Faction" options={FACTIONS} value={faction} onChange={setFaction} />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Leveling zones for the {faction} by level</caption>
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="p-3 font-medium w-24">Levels</th>
              <th scope="col" className="p-3 font-medium">Zones</th>
            </tr>
          </thead>
          <tbody>
            {LEVELING_ZONES[faction].map((band) => (
              <tr key={band.levels} className="border-b last:border-0 align-top">
                <td className="p-3 font-medium whitespace-nowrap">{band.levels}</td>
                <td className="p-3">{band.zones.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <BetaZonesCallout />
    </GuideSection>
  );
}
