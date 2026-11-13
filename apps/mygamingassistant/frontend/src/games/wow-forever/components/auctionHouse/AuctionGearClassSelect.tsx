import { WOW_CLASSES, type WowClassId } from "@/games/wow-forever/data/classes";
import { GEAR_FOR_COPY } from "@/games/wow-forever/data/auctionHouse/auctionGearForCopy";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";

interface AuctionGearClassSelectProps {
  /** The class picked, or null for any class. */
  value: WowClassId | null;
  /** The player's saved class, marked "(you)". */
  playerClass: WowClassId;
  onFilters: (patch: Partial<AuctionFilters>) => void;
}

const ANY_CLASS = "";

/** "Gear for": any class, or only what one class can equip (and whose top picks to show). */
export default function AuctionGearClassSelect({ value, playerClass, onFilters }: AuctionGearClassSelectProps) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium sm:flex-none">
      {GEAR_FOR_COPY.label}
      <select
        value={value ?? ANY_CLASS}
        onChange={(e) => {
          const picked = WOW_CLASSES.find((c) => c.id === e.target.value)?.id ?? null;
          onFilters({ classId: picked, usable: false });
        }}
        className="min-h-[44px] w-full rounded-md border bg-background px-3 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-primary sm:w-56"
      >
        <option value={ANY_CLASS}>{GEAR_FOR_COPY.anyClass}</option>
        {WOW_CLASSES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.id === playerClass ? `${c.name} ${GEAR_FOR_COPY.you}` : c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
