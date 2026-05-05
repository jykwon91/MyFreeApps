import { useState } from "react";
import { CheckCircle, ChevronDown, ChevronRight, Download, HelpCircle, XCircle } from "lucide-react";
import Badge from "@/shared/components/ui/Badge";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from "@/shared/lib/inquiry-date-format";
import type { ScreeningResult } from "@/shared/types/applicant/screening-result";

interface StatusMeta {
  label: string;
  color: BadgeColor;
  icon: React.ReactNode;
  summary: string;
}

const STATUS_META: Record<string, StatusMeta> = {
  pass: {
    label: "Passed",
    color: "green",
    icon: <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden="true" />,
    summary: "Background check came back clean.",
  },
  fail: {
    label: "Failed",
    color: "red",
    icon: <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />,
    summary: "Background check returned a declined result.",
  },
  inconclusive: {
    label: "Inconclusive",
    color: "yellow",
    icon: <HelpCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />,
    summary: "The provider couldn't return a clear verdict — review the report for details.",
  },
};

const PROVIDER_LABELS: Record<string, string> = {
  keycheck: "KeyCheck",
  rentspree: "RentSpree",
  other: "Other",
};

export interface ScreeningResultCardProps {
  result: ScreeningResult;
}

/**
 * Clean result card for a completed screening attempt (pass / fail / inconclusive).
 *
 * - Pending results are rendered separately in ``ScreeningPendingPanel``.
 * - Adverse-action snippet is collapsed by default (FCRA-relevant — the host
 *   expands it intentionally to read the reason for their records).
 * - Download link uses the per-row ``presigned_url`` minted by the backend.
 */
export default function ScreeningResultCard({ result }: ScreeningResultCardProps) {
  const [snippetOpen, setSnippetOpen] = useState(false);
  const meta = STATUS_META[result.status] ?? {
    label: result.status,
    color: "gray" as BadgeColor,
    icon: null,
    summary: "",
  };
  const providerLabel = PROVIDER_LABELS[result.provider] ?? result.provider;

  return (
    <div
      data-testid={`screening-result-card-${result.id}`}
      className="rounded-lg border bg-card p-4 space-y-3"
    >
      {/* Header row: icon + status badge + provider + timestamp */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {meta.icon}
          <div>
            <div className="flex items-center gap-2">
              <Badge label={meta.label} color={meta.color} />
              <span className="text-xs text-muted-foreground font-medium">{providerLabel}</span>
            </div>
            {meta.summary ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{meta.summary}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
          <span title={formatAbsoluteTime(result.uploaded_at)}>
            Uploaded {formatRelativeTime(result.uploaded_at)}
          </span>
          {result.presigned_url ? (
            <a
              href={result.presigned_url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`screening-download-${result.id}`}
              className="inline-flex items-center gap-1 text-primary hover:underline min-h-[44px]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Report
            </a>
          ) : null}
        </div>
      </div>

      {/* Adverse-action snippet — collapsed by default */}
      {result.adverse_action_snippet ? (
        <div className="text-xs border-t pt-2">
          <button
            type="button"
            onClick={() => setSnippetOpen((v) => !v)}
            data-testid={`screening-snippet-toggle-${result.id}`}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground min-h-[44px]"
            aria-expanded={snippetOpen}
          >
            {snippetOpen ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Adverse action reason
          </button>
          {snippetOpen ? (
            <p
              data-testid={`screening-snippet-text-${result.id}`}
              className="mt-1 ml-5 text-muted-foreground whitespace-pre-wrap leading-relaxed"
            >
              {result.adverse_action_snippet}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
