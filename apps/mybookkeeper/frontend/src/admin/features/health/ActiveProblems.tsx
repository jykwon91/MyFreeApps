import { cn } from "@/shared/utils/cn";
import Badge from "@/shared/components/ui/Badge";
import type { ActiveProblem } from "@/shared/types/health/health-summary";
import { SEVERITY_BADGE_COLOR, severityIcon, severityBorder } from "@/admin/features/health/severity";

interface ActiveProblemsProps {
  problems: ActiveProblem[];
}

export default function ActiveProblems({ problems }: ActiveProblemsProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-medium">Active Problems</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {problems.map((problem, idx) => (
          <div
            key={`${problem.type}-${idx}`}
            className={cn(
              "border rounded-lg p-4 border-l-4 flex items-start gap-3",
              severityBorder(problem.severity),
            )}
          >
            {severityIcon(problem.severity)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{problem.message}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {problem.count} occurrence{problem.count === 1 ? "" : "s"}
              </p>
            </div>
            <Badge label={problem.severity} color={SEVERITY_BADGE_COLOR[problem.severity] ?? "gray"} />
          </div>
        ))}
      </div>
    </section>
  );
}
