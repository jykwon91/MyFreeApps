import CopyButton from "@/games/wow-forever/components/worldMap/CopyButton";
import { targetLine } from "@/games/wow-forever/lib/rares/targetMacros";

/** `/target <Name>` to type or paste in game, with a copy button. */
export default function RareTargetLine({ name }: { name: string }) {
  const line = targetLine(name);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded bg-muted/40 px-2 py-1 text-sm break-all" data-testid="rare-target-line">
        {line}
      </code>
      <CopyButton text={line} label="Copy" title={`Copy ${line}`} />
    </div>
  );
}
