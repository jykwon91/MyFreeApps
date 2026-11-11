/**
 * The wait while an analysis runs: what's being read, then "longer than
 * usual" once it has run past the usual wait.
 */
import { Loader2 } from "lucide-react";
import { EmptyState } from "@platform/ui";
import type { JobAnalysisSource } from "@myjobhunter/api-client/types/job-analysis/job-analysis-source";

interface AnalyzeProcessingViewProps {
  sourcePath: JobAnalysisSource;
  longRunning: boolean;
}

export default function AnalyzeProcessingView({ sourcePath, longRunning }: AnalyzeProcessingViewProps) {
  const primary =
    sourcePath === "url"
      ? "Reading the posting and analyzing fit…"
      : "Analyzing this role…";
  const longCopy = "This is taking longer than usual…";
  return (
    <div className="max-w-2xl">
      <EmptyState
        icon={
          <Loader2
            size={36}
            className="animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        }
        heading={longRunning ? longCopy : primary}
        body={
          longRunning
            ? "Long postings can take 10–20 seconds to score."
            : "Usually takes 5–15 seconds."
        }
      />
    </div>
  );
}
