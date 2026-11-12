import clsx from "clsx";
import CharacterSlotRow from "@/games/wow-forever/components/character/CharacterSlotRow";
import { slotContent, visibleSlots } from "@/games/wow-forever/lib/character/characterGear";
import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";
import type { PaperDollSlot } from "@/games/wow-forever/types/character/paperDollSlot";

interface CharacterSlotListProps {
  slots: readonly PaperDollSlot[];
  bySlot: ReadonlyMap<string, CharacterItem>;
  label: string;
  className?: string;
}

/** A column of gear sockets, in the paper doll's order. */
export default function CharacterSlotList({ slots, bySlot, label, className }: CharacterSlotListProps) {
  return (
    <ul aria-label={label} className={clsx("space-y-2", className)}>
      {visibleSlots(slots, bySlot).map((slot) => (
        <CharacterSlotRow key={slot.slot} slot={slot} content={slotContent(slot.slot, bySlot)} />
      ))}
    </ul>
  );
}
