import type { RankedItem } from "@/games/wow-forever/scoring/scoreTypes";

export default function RankedItemRow({ entry, rank }: { entry: RankedItem; rank: number }) {
  const width = `${Math.max(0, Math.min(100, entry.pctOfBest))}%`;
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium truncate">
          {rank}. {entry.item.name}
        </span>
        <span className="whitespace-nowrap text-muted-foreground">
          {entry.score.total.toFixed(1)} pts · {entry.pctOfBest}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted/40" aria-hidden>
        <div className="h-2 rounded-full bg-primary" style={{ width }} />
      </div>
      {entry.score.notes.map((note) => (
        <p key={note} className="text-xs text-orange-700 dark:text-orange-300">
          {note}
        </p>
      ))}
    </li>
  );
}
