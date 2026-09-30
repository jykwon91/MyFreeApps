import { CheckCircle2, Circle } from "lucide-react";

interface ScenarioGoalsProps {
  goals: string[];
  /** 0-based indexes of the goals already met (computed server-side). */
  met: number[];
}

/** The scenario's goals, ticked off as the conversation covers them. */
export default function ScenarioGoals({ goals, met }: ScenarioGoalsProps) {
  if (goals.length === 0) return null;
  const done = new Set(met);
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Goals for this conversation">
      {goals.map((goal, index) => {
        const isMet = done.has(index);
        return (
          <li key={goal} className="flex items-center gap-1 text-muted-foreground">
            {isMet ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
            ) : (
              <Circle className="h-4 w-4" aria-hidden="true" />
            )}
            <span className={isMet ? "text-foreground" : undefined}>{goal}</span>
            <span className="sr-only">{isMet ? "(done)" : "(not yet)"}</span>
          </li>
        );
      })}
    </ul>
  );
}
