import clsx from "clsx";
import { SOURCE_CHIP, type SourceChipKind } from "@/games/wow-forever/gear/gearSourceText";

const TONE: Record<SourceChipKind, string> = {
  crafted: "border-primary/50 text-primary",
  quest: "text-muted-foreground",
  drop: "text-muted-foreground",
  unknown: "border-dashed text-muted-foreground",
};

/** Where an item comes from, and how sure we are: game files, Classic data, or nothing known. */
export default function GearSourceChip({ kind }: { kind: SourceChipKind }) {
  return (
    <span data-testid="gear-source-chip" className={clsx("inline-block rounded border px-1.5 py-0.5 text-xs", TONE[kind])}>
      {SOURCE_CHIP[kind]}
    </span>
  );
}
