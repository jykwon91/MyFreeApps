import { AUCTION_MATERIAL_PROFESSIONS } from "@/games/wow-forever/data/auctionHouse/auctionMaterialProfessions";
import { isCraftingProfession } from "@/games/wow-forever/lib/guideProfession";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";

interface AuctionProfessionSelectProps {
  value: CraftingProfession | null;
  onChange: (next: CraftingProfession | null) => void;
}

const ALL = "";

/** "Profession": narrow the list to one profession's materials. */
export default function AuctionProfessionSelect({ value, onChange }: AuctionProfessionSelectProps) {
  return (
    <label className="flex flex-col gap-1 text-sm sm:max-w-xs">
      <span className="font-medium">Profession</span>
      <select
        value={value ?? ALL}
        onChange={(e) => onChange(isCraftingProfession(e.target.value) ? e.target.value : null)}
        className="min-h-[44px] rounded-md border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        data-testid="auction-profession"
      >
        <option value={ALL}>All items</option>
        {AUCTION_MATERIAL_PROFESSIONS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} materials
          </option>
        ))}
      </select>
    </label>
  );
}
