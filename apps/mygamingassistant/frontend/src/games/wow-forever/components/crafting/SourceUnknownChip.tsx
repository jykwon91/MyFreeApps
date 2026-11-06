import WowheadLink from "@/games/wow-forever/components/WowheadLink";
import { wowheadForeverSpellUrl } from "@/games/wow-forever/lib/wowheadUrl";

interface SourceUnknownChipProps {
  /** Recipe spell id — when provided, renders a Wowhead look-up link alongside the chip. */
  spellId?: number;
}

/** A recipe Forever added: where to learn it isn't known yet. The word carries the meaning, not a color. */
export default function SourceUnknownChip({ spellId }: SourceUnknownChipProps) {
  return (
    <>
      <span className="inline-block rounded border border-dashed px-1.5 py-0.5 text-xs font-normal text-muted-foreground align-middle">
        Source unknown
      </span>
      {spellId !== undefined ? (
        <WowheadLink href={wowheadForeverSpellUrl(spellId)} className="text-xs text-primary underline" />
      ) : null}
    </>
  );
}
