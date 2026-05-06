/**
 * Header strip for the analysis result — shows the role title, company
 * name, location pill, and a clickable source-url affordance when the
 * operator analyzed a URL.
 *
 * Stays compact so the verdict banner immediately below it is the
 * dominant visual element on the page.
 */
import { ExternalLink } from "lucide-react";
import type { JobAnalysisExtracted } from "@/types/job-analysis/job-analysis";

interface JobAnalysisHeaderProps {
  extracted: JobAnalysisExtracted;
  sourceUrl: string | null;
}

export default function JobAnalysisHeader({
  extracted,
  sourceUrl,
}: JobAnalysisHeaderProps) {
  const title = extracted.title?.trim() || "Untitled role";
  const company = extracted.company?.trim() || "Unknown company";
  const location = extracted.location?.trim();

  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{company}</span>
        {location ? (
          <>
            {" — "}
            <span>{location}</span>
          </>
        ) : null}
      </p>
      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline truncate max-w-full"
        >
          <ExternalLink size={12} />
          <span className="truncate">{sourceUrl}</span>
        </a>
      ) : null}
    </header>
  );
}
