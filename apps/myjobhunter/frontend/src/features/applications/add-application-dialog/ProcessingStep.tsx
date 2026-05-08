/**
 * ProcessingStep — step-2 spinner shown while the URL extract or
 * JD-text parse mutation is in flight.
 *
 * After PROCESSING_LONG_RUNNING_THRESHOLD_MS the parent hook flips
 * `longRunning` to true, which swaps the copy from "Reading job
 * posting…" to "This is taking longer than usual…".
 */
import { Loader2 } from "lucide-react";

interface ProcessingStepProps {
  longRunning: boolean;
  sourcePath: "url" | "text";
}

export default function ProcessingStep({ longRunning, sourcePath }: ProcessingStepProps) {
  const primaryCopy =
    sourcePath === "url" ? "Reading job posting…" : "Reading description…";
  const longRunningCopy = "This is taking longer than usual…";

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <Loader2 size={28} className="animate-spin text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-center">
        {longRunning ? longRunningCopy : primaryCopy}
      </p>
    </div>
  );
}
