import type { ListLoadMode } from "@/shared/types/list-load-mode";
import type { ScreeningReport } from "@mybookkeeper/api-client/types/applicant/screening-report";
import type { ScreeningResult } from "@mybookkeeper/api-client/types/applicant/screening-result";
import ScreeningResultCard from "./ScreeningResultCard";

export interface ScreeningHistoryBodyProps {
  mode: ListLoadMode;
  completedResults: ScreeningResult[];
  reports?: readonly ScreeningReport[];
  /** Say "no reports yet" only where a writer could start one: eligible, nothing pending. */
  showEmptyNote: boolean;
}

/** Completed screening reports, below whatever the status panel shows. */
export default function ScreeningHistoryBody({ mode, completedResults, reports, showEmptyNote }: ScreeningHistoryBodyProps) {
  switch (mode) {
    case "loading":
    case "error":
      // ScreeningSection shows its skeleton or the history's retry line instead.
      return null;
    case "empty":
      if (!showEmptyNote) return null;
      return (
        <p data-testid="screening-results-empty" className="text-xs text-muted-foreground italic">
          No completed screening reports yet.
        </p>
      );
    case "list":
      return (
        <div data-testid="screening-results-list" className="space-y-3">
          {completedResults.map((result) => (
            <ScreeningResultCard
              key={result.id}
              result={result}
              report={reports?.find((report) => report.id === result.id)}
            />
          ))}
        </div>
      );
  }
}
