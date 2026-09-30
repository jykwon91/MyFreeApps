import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { Scenario } from "@/types/catalog/scenario";

interface ScenarioCardProps {
  scenario: Scenario;
}

/** One step in the learning path; opens the practice screen for it. */
export default function ScenarioCard({ scenario }: ScenarioCardProps) {
  return (
    <li>
      <Link
        to={`/practice?scenario=${encodeURIComponent(scenario.slug)}`}
        className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border bg-card p-4 hover:bg-muted"
      >
        <span>
          <span className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {scenario.order}.
            </span>
            <span className="font-medium">{scenario.title}</span>
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">{scenario.goal}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}
