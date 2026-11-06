import GearSourceChip from "@/games/wow-forever/components/gear/GearSourceChip";
import { CLOSE_SCORE_PCT } from "@/games/wow-forever/data/gear/gearPageConfig";
import { SOURCE_CHIP, type SourceChipKind } from "@/games/wow-forever/gear/gearSourceText";

const CHIP_KINDS = Object.keys(SOURCE_CHIP) as SourceChipKind[];

interface GearFootnotesProps {
  leveling: boolean;
  /** Leveling: items left out because nothing says what level you get them at. */
  unknownLevelCount: number;
  clientBuild: string;
}

/** The source legend, the close-score rule and where the data comes from. */
export default function GearFootnotes({ leveling, unknownLevelCount, clientBuild }: GearFootnotesProps) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 text-xs text-muted-foreground">
      <div className="flex flex-wrap gap-1.5" aria-label="Source labels">
        {CHIP_KINDS.map((kind) => (
          <GearSourceChip key={kind} kind={kind} />
        ))}
      </div>
      <p>
        &ldquo;Game files&rdquo; = the Forever client ({clientBuild}). &ldquo;Classic data&rdquo; = where the item came from in
        Classic (cmangos, GPL), which Forever may have changed. The Forever client has no boss loot tables, so most
        dungeon drops show as &ldquo;Source unknown&rdquo;.
      </p>
      <p>
        An item with a known source ranks above one with none unless the unknown one scores more than {CLOSE_SCORE_PCT}%
        higher — the weights can&apos;t tell items that close apart.
      </p>
      {leveling ? (
        <p>
          While leveling, every spec of a class uses one rule-of-thumb weighting.
          {unknownLevelCount > 0
            ? ` ${unknownLevelCount} items are left out because nothing says what level you can get them at.`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
