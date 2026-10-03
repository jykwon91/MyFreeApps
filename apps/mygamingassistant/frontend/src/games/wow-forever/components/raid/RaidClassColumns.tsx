import RaidColumnCard from "@/games/wow-forever/components/raid/RaidColumnCard";
import RaidNoSignups from "@/games/wow-forever/components/raid/RaidNoSignups";
import { classAccent } from "@/games/wow-forever/data/classAccents";
import { countLabel } from "@/games/wow-forever/lib/raidLabels";
import type { RaidColumn } from "@/games/wow-forever/types/raid";

interface RaidClassColumnsProps {
  columns: RaidColumn[];
  iconsVersion: string;
  discordUrl: string | null;
}

/** A card per column with anyone in it, in the post's order: 1, 2 or 4 across by width; else the empty state. */
export default function RaidClassColumns({ columns, iconsVersion, discordUrl }: RaidClassColumnsProps) {
  if (columns.length === 0) return <RaidNoSignups discordUrl={discordUrl} />;
  return (
    <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {columns.map((column) => (
        <RaidColumnCard
          key={column.key}
          heading={column.label}
          icon={column.icon}
          count={countLabel(column.count, column.limit)}
          accent={classAccent(column.key)}
          entries={column.entries}
          iconsVersion={iconsVersion}
          numbered
        />
      ))}
    </div>
  );
}
