import { DETAIL_CHIP } from "@/games/wow-forever/components/food/detail/detailStyles";

/** Marks a giver or objective found only inside this dungeon. */
export default function InsideDungeonChip() {
  return (
    <span className={DETAIL_CHIP} data-testid="quest-inside-dungeon">
      Inside the dungeon
    </span>
  );
}
