/**
 * Body of the research panel — flat switch over CompanyResearchMode.
 *
 * Does not own any state or data-fetching — all props are passed in by
 * CompanyResearchPanel. This separation keeps each state branch small and
 * independently testable.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from "lucide-react";
import { Badge, LoadingButton, Skeleton } from "@platform/ui";
import type { CompanyResearchMode } from "@/features/companies/useCompanyResearchMode";
import type { CompanyResearch, ResearchSentiment } from "@/types/company-research";
import type { ResearchSource } from "@/types/research-source";

interface CompanyResearchPanelBodyProps {
  mode: CompanyResearchMode;
  research: CompanyResearch | undefined;
  onRunResearch: () => void;
  isRunning: boolean;
  errorMessage: string | null;
}

type SentimentBadgeColor = "green" | "yellow" | "red" | "gray";

const SENTIMENT_BADGE: Record<ResearchSentiment, { label: string; color: SentimentBadgeColor }> = {
  positive: { label: "Positive", color: "green" },
  mixed: { label: "Mixed", color: "yellow" },
  negative: { label: "Negative", color: "red" },
  unknown: { label: "Unknown", color: "gray" },
};

export default function CompanyResearchPanelBody({
  mode,
  research,
  onRunResearch,
  isRunning,
  errorMessage,
}: CompanyResearchPanelBodyProps) {
  switch (mode) {
    case "no-research":
      return <NoResearchState onRunResearch={onRunResearch} isRunning={isRunning} />;
    case "loading":
      return <LoadingState />;
    case "ready":
      return research ? (
        <ReadyState research={research} onRunResearch={onRunResearch} isRunning={isRunning} />
      ) : null;
    case "failed":
      return <FailedState errorMessage={errorMessage} onRunResearch={onRunResearch} isRunning={isRunning} />;
  }
}

// ---------------------------------------------------------------------------
// State branches
// ---------------------------------------------------------------------------

interface NoResearchStateProps {
  onRunResearch: () => void;
  isRunning: boolean;
}

function NoResearchState({ onRunResearch, isRunning }: NoResearchStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-sm text-muted-foreground max-w-xs">
        No research has been run yet. Click below to fetch reviews, compensation
        signals, and culture notes from the web.
      </p>
      <LoadingButton isLoading={isRunning} onClick={onRunResearch} className="mt-1">
        Run research
      </LoadingButton>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3 py-4">
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}

interface ReadyStateProps {
  research: CompanyResearch;
  onRunResearch: () => void;
  isRunning: boolean;
}

function ReadyState({ research, onRunResearch, isRunning }: ReadyStateProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const sentiment = SENTIMENT_BADGE[research.overall_sentiment] ?? SENTIMENT_BADGE.unknown;
  const lastRun = research.last_researched_at
    ? new Date(research.last_researched_at).toLocaleDateString()
    : null;

  return (
    <div className="space-y-4">
      {/* Header row: sentiment + re-run */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge label={sentiment.label} color={sentiment.color} />
          {lastRun ? (
            <span className="text-xs text-muted-foreground">Last run {lastRun}</span>
          ) : null}
        </div>
        <LoadingButton
          isLoading={isRunning}
          onClick={onRunResearch}
          className="text-xs py-1 px-3 h-auto"
        >
          Re-run
        </LoadingButton>
      </div>

      {/* Summary */}
      {research.interview_process ? (
        <section>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Summary</p>
          <p className="text-sm whitespace-pre-wrap">{research.interview_process}</p>
        </section>
      ) : null}

      {/* Comp signals */}
      {research.senior_engineer_sentiment ? (
        <section>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Culture signals</p>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {research.senior_engineer_sentiment}
          </p>
        </section>
      ) : null}

      {/* Comp range if available */}
      {research.raw_synthesis?.compensation_signals ? (
        <section>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Compensation signals
          </p>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {String(research.raw_synthesis.compensation_signals)}
          </p>
        </section>
      ) : null}

      {/* Flags */}
      <FlagsSection
        greenFlags={research.green_flags}
        redFlags={research.red_flags}
      />

      {/* Sources collapsible */}
      {research.sources.length > 0 ? (
        <section>
          <button
            type="button"
            onClick={() => setSourcesOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {sourcesOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {research.sources.length} source{research.sources.length !== 1 ? "s" : ""}
          </button>
          {sourcesOpen ? (
            <SourcesList sources={research.sources} />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

interface FailedStateProps {
  errorMessage: string | null;
  onRunResearch: () => void;
  isRunning: boolean;
}

function FailedState({ errorMessage, onRunResearch, isRunning }: FailedStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <p className="text-sm text-destructive">
        {errorMessage ?? "Research failed. Please try again."}
      </p>
      <LoadingButton isLoading={isRunning} onClick={onRunResearch}>
        Retry
      </LoadingButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FlagsSectionProps {
  greenFlags: string[];
  redFlags: string[];
}

function FlagsSection({ greenFlags, redFlags }: FlagsSectionProps) {
  if (greenFlags.length === 0 && redFlags.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {greenFlags.length > 0 ? (
        <FlagList title="Green flags" flags={greenFlags} icon="green" />
      ) : null}
      {redFlags.length > 0 ? (
        <FlagList title="Red flags" flags={redFlags} icon="red" />
      ) : null}
    </div>
  );
}

interface FlagListProps {
  title: string;
  flags: string[];
  icon: "green" | "red";
}

function FlagList({ title, flags, icon }: FlagListProps) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">{title}</p>
      <ul className="space-y-1">
        {flags.map((flag, i) => (
          <li key={i} className="flex items-start gap-1.5 text-sm">
            {icon === "green" ? (
              <CheckCircle size={13} className="text-green-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={13} className="text-destructive shrink-0 mt-0.5" />
            )}
            <span>{flag}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SourcesListProps {
  sources: ResearchSource[];
}

function SourcesList({ sources }: SourcesListProps) {
  return (
    <ul className="mt-2 space-y-1.5">
      {sources.map((source) => (
        <li key={source.id}>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline break-all"
          >
            {source.title ?? source.url}
          </a>
          {source.snippet ? (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{source.snippet}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
