import { useId, type ReactElement, type ReactNode } from "react";
import RaidEntryRow from "@/games/wow-forever/components/raid/RaidEntryRow";
import RaidIcon from "@/games/wow-forever/components/raid/RaidIcon";
import type { RaidEntry } from "@/games/wow-forever/types/raid";

interface RaidColumnCardProps {
  heading: string;
  icon: string | null;
  /** "3", or "2/2" against a limit. */
  count: string;
  entries: RaidEntry[];
  iconsVersion: string;
  /** The line-up's columns are in order (`<ol>`); the lists aren't (`<ul>`). */
  numbered: boolean;
  /** The class colour, as a 3 px bar; none for Tanks, the lists and "No class yet". */
  accent?: string;
}

/** A column of the line-up, or one of the lists: its heading and count, then its players. */
export default function RaidColumnCard({
  heading,
  icon,
  count,
  entries,
  iconsVersion,
  numbered,
  accent,
}: RaidColumnCardProps) {
  const headingId = useId();
  const rows = entries.map((entry) => <RaidEntryRow key={entry.id} entry={entry} iconsVersion={iconsVersion} />);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="h-[3px] bg-muted" style={{ backgroundColor: accent }} aria-hidden />
      <h3 id={headingId} className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
        {icon && <RaidIcon name={icon} version={iconsVersion} alt="" />}
        <span className="min-w-0 flex-1 truncate">{heading}</span>
        <span className="tabular-nums text-muted-foreground">{count}</span>
      </h3>
      {renderList(numbered, headingId, rows)}
    </div>
  );
}

function renderList(numbered: boolean, headingId: string, rows: ReactNode): ReactElement {
  if (numbered) {
    return (
      <ol aria-labelledby={headingId} className="divide-y">
        {rows}
      </ol>
    );
  }
  return (
    <ul aria-labelledby={headingId} className="divide-y">
      {rows}
    </ul>
  );
}
