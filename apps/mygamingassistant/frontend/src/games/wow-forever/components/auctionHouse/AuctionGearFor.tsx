import AuctionBisLevelField from "@/games/wow-forever/components/auctionHouse/AuctionBisLevelField";
import AuctionFilterChips from "@/games/wow-forever/components/auctionHouse/AuctionFilterChips";
import AuctionGearClassSelect from "@/games/wow-forever/components/auctionHouse/AuctionGearClassSelect";
import { bisLegend } from "@/games/wow-forever/data/auctionHouse/auctionBisCopy";
import { BIS_CHIPS, BIS_OFF_CHIP_ID } from "@/games/wow-forever/data/auctionHouse/auctionBisOptions";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { bisPatch } from "@/games/wow-forever/lib/auctionHouse/bisPatch";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";

interface AuctionGearForProps {
  filters: AuctionFilters;
  onFilters: (patch: Partial<AuctionFilters>) => void;
  playerClass: WowClassId;
  /** Whose picks they are: the picked class's name, else the player's. */
  classLabel: string;
  /** The level the top picks are for (the player's, or the link's). */
  bisLevel: number;
  /** The player's saved level (else 60), shown in the empty level box. */
  playerLevel: number;
}

/** On the page itself, not inside Filters: which class the gear is for, at what level, and its #1/#2/#3 picks. */
export default function AuctionGearFor({ filters, onFilters, playerClass, classLabel, bisLevel, playerLevel }: AuctionGearForProps) {
  const picked = filters.classId ?? (filters.usable ? playerClass : null);
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-end sm:gap-6" data-testid="auction-gear-for">
      <div className="flex gap-3">
        <AuctionGearClassSelect value={picked} playerClass={playerClass} onFilters={onFilters} />
        <AuctionBisLevelField filters={filters} onFilters={onFilters} defaultLevel={playerLevel} />
      </div>
      <AuctionFilterChips
        legend={bisLegend(bisLevel, classLabel)}
        options={BIS_CHIPS}
        value={[filters.bis === null ? BIS_OFF_CHIP_ID : `${filters.bis}`]}
        onToggle={(id) => onFilters(bisPatch(id, filters.bis))}
        testId="auction-filter-bis"
      />
    </div>
  );
}
