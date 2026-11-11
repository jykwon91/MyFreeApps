import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge, LoadingButton } from "@platform/ui";
import type { CompanyResearch } from "@myjobhunter/api-client/types/company-research";
import { researchCompensationSignals } from "@myjobhunter/api-client/utils/researchCompensationSignals";
import { researchSentimentLabel, researchSentimentTone } from "@myjobhunter/api-client/utils/researchSentiment";
import { STATUS_TONE_BADGE_COLORS } from "@/constants/statusToneBadgeColors";
import FlagsSection from "./FlagsSection";
import SourcesList from "./SourcesList";

interface ReadyStateProps {
  research: CompanyResearch;
  onRunResearch: () => void;
  isRunning: boolean;
}

export default function ReadyState({ research, onRunResearch, isRunning }: ReadyStateProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const compensationSignals = researchCompensationSignals(research);
  const lastRun = research.last_researched_at
    ? new Date(research.last_researched_at).toLocaleDateString()
    : null;

  return (
    <div className="space-y-4">
      {/* Header row: sentiment + re-run */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge label={researchSentimentLabel(research)} color={STATUS_TONE_BADGE_COLORS[researchSentimentTone(research)]} />
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

      {/* What the company does */}
      {research.description ? (
        <section>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            What they do
          </p>
          <p className="text-sm whitespace-pre-wrap">{research.description}</p>
        </section>
      ) : null}

      {/* Personalised: products that match the user's background.
          Uses an emerald accent so it visually anchors as the
          "this is about YOU" section. */}
      {research.products_for_you ? (
        <section className="border-l-2 border-emerald-500/60 pl-3">
          <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1">
            Products that match your background
          </p>
          <p className="text-sm whitespace-pre-wrap">{research.products_for_you}</p>
        </section>
      ) : null}

      {/* Summary */}
      {research.interview_process ? (
        <section>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Summary</p>
          <p className="text-sm whitespace-pre-wrap">{research.interview_process}</p>
        </section>
      ) : null}

      {/* Culture signals */}
      {research.senior_engineer_sentiment ? (
        <section>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Culture signals</p>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {research.senior_engineer_sentiment}
          </p>
        </section>
      ) : null}

      {/* Comp signals */}
      {compensationSignals ? (
        <section>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Compensation signals
          </p>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {compensationSignals}
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
