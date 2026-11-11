/**
 * Header strip for the analysis result — shows the role title, company
 * name, location pill, and a clickable source-url affordance when the
 * operator analyzed a URL. Only an http(s) source is a link; anything
 * else shows as plain text.
 *
 * Stays compact so the verdict banner immediately below it is the
 * dominant visual element on the page.
 */
import { ExternalLink } from "lucide-react";
import type { JobAnalysisExtracted } from "@myjobhunter/api-client/types/job-analysis/job-analysis-extracted";
import { jobAnalysisHeadline } from "@myjobhunter/api-client/utils/jobAnalysisHeadline";
import { jobAnalysisSourceUrl } from "@myjobhunter/api-client/utils/jobAnalysisSourceUrl";

interface JobAnalysisHeaderProps {
  extracted: JobAnalysisExtracted;
  sourceUrl: string | null;
}

export default function JobAnalysisHeader({
  extracted,
  sourceUrl,
}: JobAnalysisHeaderProps) {
  const { title, company, location } = jobAnalysisHeadline(extracted);
  const sourceHref = jobAnalysisSourceUrl(sourceUrl);

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
      {sourceHref ? (
        <a
          href={sourceHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline truncate max-w-full"
        >
          <ExternalLink size={12} />
          <span className="truncate">{sourceHref}</span>
        </a>
      ) : sourceUrl ? (
        <p className="text-xs text-muted-foreground truncate">{sourceUrl}</p>
      ) : null}
    </header>
  );
}
