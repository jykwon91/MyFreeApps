import { Select } from "@platform/ui";
import EditedMark from "@/games/wow-forever/components/compare/EditedMark";
import StatTable from "@/games/wow-forever/components/compare/StatTable";
import WeaponFields from "@/games/wow-forever/components/compare/WeaponFields";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import { isItemSlot, isWeaponSlot, ITEM_SLOTS, SLOT_LABELS } from "@/games/wow-forever/data/itemSlots";
import { formatWeapon } from "@/games/wow-forever/lib/describeClientItem";
import { sameWeapon } from "@/games/wow-forever/lib/itemNumbers";
import type { CompareItem } from "@/games/wow-forever/types/compareItem";

interface ItemDetailsEditorProps {
  item: CompareItem;
  onChange: (item: CompareItem) => void;
}

const UNKNOWN_SLOT = "";

/** Slot, armor, weapon and stats — every number is editable. */
export default function ItemDetailsEditor({ item, onChange }: ItemDetailsEditorProps) {
  const baseline = item.origin?.baseline ?? null;
  const armorEdited = baseline !== null && item.armor !== baseline.armor;
  const weaponEdited = baseline !== null && !sameWeapon(item.weapon, baseline.weapon);
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
        <div className="space-y-1">
          <NumberField label="Armor" value={item.armor} min={0} onChange={(armor) => onChange({ ...item, armor })} />
          {baseline && armorEdited ? (
            <EditedMark gameFileValue={baseline.armor === null ? "no armor" : `${baseline.armor} armor`} />
          ) : null}
        </div>
      </div>
      {isWeaponSlot(item.slot) ? (
        <div className="space-y-1">
          <WeaponFields weapon={item.weapon} onChange={(weapon) => onChange({ ...item, weapon })} />
          {baseline && weaponEdited ? (
            <EditedMark gameFileValue={baseline.weapon ? formatWeapon(baseline.weapon) : "no damage listed"} />
          ) : null}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Stats</p>
        <StatTable
          itemName={item.name}
          stats={item.stats}
          baseline={baseline?.stats ?? null}
          onChange={(stats) => onChange({ ...item, stats })}
        />
      </div>
    </div>
  );
}
