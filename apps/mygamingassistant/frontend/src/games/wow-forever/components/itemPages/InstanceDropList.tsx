import InstanceDropRow from "@/games/wow-forever/components/itemPages/InstanceDropRow";
import type { InstanceDrop } from "@/games/wow-forever/types/itemPages/instanceDrop";

interface InstanceDropListProps {
  drops: readonly InstanceDrop[];
  /** More mobs drop it than are listed (only told with the last list). */
  more: number;
  note: string;
}

export default function InstanceDropList({ drops, more, note }: InstanceDropListProps) {
  return (
    <div className="space-y-2">
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      <ul className="space-y-2">
        {drops.map((d) => (
          <InstanceDropRow key={`${d.instance.id}-${d.name}`} drop={d} />
        ))}
      </ul>
      {more > 0 ? <p className="text-xs text-muted-foreground">And {more} more mobs inside.</p> : null}
    </div>
  );
}
