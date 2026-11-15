import type { LucideIcon } from "lucide-react";

interface PlanStatTileProps {
  icon: LucideIcon;
  title: string;
  value: string;
  detail: string;
  testId: string;
}

/** One headline number of the plan: gold, travel time or crafts. */
export default function PlanStatTile({ icon: Icon, title, value, detail, testId }: PlanStatTileProps) {
  return (
    <div className="rounded-lg border bg-card p-3" data-testid={testId}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {title}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
