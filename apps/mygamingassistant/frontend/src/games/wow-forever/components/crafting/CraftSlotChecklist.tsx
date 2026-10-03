import { ENCHANT_SLOTS, type EnchantSlot } from "@/games/wow-forever/crafting/cheapestRoute";

interface CraftSlotChecklistProps {
  excluded: ReadonlySet<EnchantSlot>;
  onToggle: (slot: EnchantSlot, allowed: boolean) => void;
}

/** "Gear you can enchant" — an enchant needs an item in that slot to go on. */
export default function CraftSlotChecklist({ excluded, onToggle }: CraftSlotChecklistProps) {
  return (
    <fieldset className="space-y-1 min-w-0">
      <legend className="text-sm font-medium">Gear you can enchant</legend>
      <p className="text-xs text-muted-foreground">Untick a slot you have nothing to put the enchant on — e.g. no shield.</p>
      <ul className="grid grid-cols-1 min-[375px]:grid-cols-2 sm:grid-cols-3 gap-x-4">
        {ENCHANT_SLOTS.map((slot) => (
          <li key={slot}>
            <label className="flex items-center gap-3 min-h-[44px] cursor-pointer text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0"
                checked={!excluded.has(slot)}
                onChange={(e) => onToggle(slot, e.target.checked)}
              />
              {slot}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
