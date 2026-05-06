/**
 * Verdict banner — large, color-coded strip that announces the
 * top-level fit assessment. Sits directly under the header so the
 * operator sees it before scanning the per-dimension grid below.
 *
 * Color/tone is keyed off the verdict enum (see VERDICT_BANNER_CLASSES
 * in types/job-analysis/job-analysis-verdict.ts).
 */
import {
  VERDICT_BANNER_CLASSES,
  VERDICT_LABELS,
  type JobAnalysisVerdict,
} from "@/types/job-analysis/job-analysis-verdict";

interface VerdictBannerProps {
  verdict: JobAnalysisVerdict;
  summary: string;
}

export default function VerdictBanner({ verdict, summary }: VerdictBannerProps) {
  const label = VERDICT_LABELS[verdict] ?? "Analyzed";
  const tone = VERDICT_BANNER_CLASSES[verdict] ?? VERDICT_BANNER_CLASSES.worth_considering;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-lg border-2 p-4 ${tone}`}
    >
      <p className="text-xs uppercase tracking-wider font-semibold opacity-80">
        Overall verdict
      </p>
      <p className="text-xl font-semibold mt-1">{label}</p>
      <p className="text-sm mt-2 leading-relaxed">{summary}</p>
    </div>
  );
}
