import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@platform/ui";
import { SCENARIO_CARD_BOX, SCENARIO_GOAL_GAP, TWO_TEXT_LINES } from "@/constants/catalogLayout";
import { practicePath } from "@mylanguagetutor/api-client/utils/practicePath";
import type { Scenario } from "@mylanguagetutor/api-client/types/catalog/scenario";

interface ScenarioCardProps {
  scenario: Scenario;
}

/** One step in the learning path; opens the practice screen for it. */
export default function ScenarioCard({ scenario }: ScenarioCardProps) {
  return (
    <li>
      <Link
        to={practicePath(scenario.slug)}
        className={cn("flex min-h-[44px] items-center justify-between gap-3 bg-card hover:bg-muted", SCENARIO_CARD_BOX)}
      >
        <span>
          <span className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {scenario.order}.
            </span>
            <span className="font-medium">{scenario.title}</span>
          </span>
          <span className={cn("block text-sm text-muted-foreground", SCENARIO_GOAL_GAP, TWO_TEXT_LINES)}>{scenario.goal}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}
