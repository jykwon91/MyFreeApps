import type { Scenario } from "@/types/catalog/scenario";

interface ScenarioCardProps {
  scenario: Scenario;
}

/** One step in the learning path. Read-only until the conversation screen lands. */
export default function ScenarioCard({ scenario }: ScenarioCardProps) {
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {scenario.order}.
        </span>
        <h3 className="font-medium">{scenario.title}</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{scenario.goal}</p>
    </li>
  );
}
