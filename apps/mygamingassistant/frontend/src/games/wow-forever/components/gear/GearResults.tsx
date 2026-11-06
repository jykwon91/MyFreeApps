import GearFootnotes from "@/games/wow-forever/components/gear/GearFootnotes";
import GearSlotCard from "@/games/wow-forever/components/gear/GearSlotCard";
import type { GearRanking } from "@/games/wow-forever/types/gearRanking";

interface GearResultsProps {
  ranking: GearRanking;
  /** "Best gear for a level 20 Affliction Warlock, Alliance". */
  heading: string;
  leveling: boolean;
  clientBuild: string;
}

/** The slot cards (one column on a phone, two from small screens up) and the notes under them. */
export default function GearResults({ ranking, heading, leveling, clientBuild }: GearResultsProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{heading}</p>
      <div data-testid="gear-slot-grid" className="grid gap-4 sm:grid-cols-2">
        {ranking.slots.map((slot) => (
          <GearSlotCard key={slot.group.id} result={slot} />
        ))}
      </div>
      <GearFootnotes leveling={leveling} unknownLevelCount={ranking.unknownLevelCount} clientBuild={clientBuild} />
    </div>
  );
}
