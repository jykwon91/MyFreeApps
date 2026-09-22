import { Select } from "@platform/ui";
import StatTable from "@/games/wow-forever/components/compare/StatTable";
import WeaponFields from "@/games/wow-forever/components/compare/WeaponFields";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import { isItemSlot, isWeaponSlot, ITEM_SLOTS, SLOT_LABELS } from "@/games/wow-forever/data/itemSlots";
import type { CompareItem } from "@/games/wow-forever/types/compareItem";

interface ItemDetailsEditorProps {
  item: CompareItem;
  onChange: (item: CompareItem) => void;
}

const UNKNOWN_SLOT = "";

/** Slot, armor, weapon and stats — every number is editable. */
export default function ItemDetailsEditor({ item, onChange }: ItemDetailsEditorProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Slot</span>
          <Select
            value={item.slot ?? UNKNOWN_SLOT}
            onChange={(e) => onChange({ ...item, slot: isItemSlot(e.target.value) ? e.target.value : null })}
            className="min-h-[44px] bg-card"
          >
            <option value={UNKNOWN_SLOT}>Unknown</option>
            {ITEM_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {SLOT_LABELS[slot]}
              </option>
            ))}
          </Select>
        </label>
        <NumberField label="Armor" value={item.armor} min={0} onChange={(armor) => onChange({ ...item, armor })} />
      </div>
      {isWeaponSlot(item.slot) ? (
        <WeaponFields weapon={item.weapon} onChange={(weapon) => onChange({ ...item, weapon })} />
      ) : null}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Stats</p>
        <StatTable itemName={item.name} stats={item.stats} onChange={(stats) => onChange({ ...item, stats })} />
      </div>
    </div>
  );
}
