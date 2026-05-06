import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import Badge from "@/shared/components/ui/Badge";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from "@/shared/lib/inquiry-date-format";
import type { ScreeningResult } from "@/shared/types/applicant/screening-result";
import { reportMissingStorageObject } from "@/shared/lib/storage-observability";

const STATUS_BADGE: Record<string, { label: string; color: BadgeColor }> = {
  pending: { label: "Pending", color: "yellow" },
  pass: { label: "Passed", color: "green" },
  fail: { label: "Failed", color: "red" },
  inconclusive: { label: "Inconclusive", color: "gray" },
};

const PROVIDER_LABELS: Record<string, string> = {
  keycheck: "KeyCheck",
  rentspree: "RentSpree",
  other: "Other",
};

export interface ScreeningResultRowProps {
  result: ScreeningResult;
}

/**
 * Single screening attempt row (PR 3.3 KeyCheck redirect-only flow).
 *
 *   - Primary timestamp is ``uploaded_at`` — the host's own timeline.
 *   - Adverse-action snippet is collapsed by default (FCRA-relevant — the
 *     host expands it intentionally to read the reason).
 *   - Download link uses the per-row ``presigned_url`` minted by the
 *     screening response builder. Storage keys are never exposed.
 *
 * When the underlying object is missing (``is_available=false``), the
 * Download link is hidden and an observability event is captured to
 * PostHog + console — there's no recovery path the user can take from
 * this row (screening reports are uploaded by the operator, not
 * regenerated), so the UI stays quiet and the operator gets a server-
 * side Sentry alert plus a client-side PostHog event.
 */
export default function ScreeningResultRow({ result }: ScreeningResultRowProps) {
  const [snippetOpen, setSnippetOpen] = useState(false);
  const statusMeta = STATUS_BADGE[result.status] ?? {
    label: result.status,
    color: "gray" as BadgeColor,
  };
  const providerLabel = PROVIDER_LABELS[result.provider] ?? result.provider;
  const isMissing =
    result.is_available === false && result.report_storage_key !== null;
  const downloadHref = isMissing ? null : result.presigned_url;

  useEffect(() => {
    if (!isMissing) return;
    reportMissingStorageObject({
      domain: "screening_report",
      attachment_id: result.id,
      storage_key: result.report_storage_key ?? "",
      parent_id: result.applicant_id,
      parent_kind: "applicant",
    });
  }, [isMissing, result.id, result.report_storage_key, result.applicant_id]);

  return (
    <li
      data-testid={`screening-result-${result.id}`}
      className="flex flex-col gap-2 border-b last:border-b-0 py-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Badge label={statusMeta.label} color={statusMeta.color} />
          <span className="font-medium text-sm truncate">{providerLabel}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span title={formatAbsoluteTime(result.uploaded_at)}>
            Uploaded {formatRelativeTime(result.uploaded_at)}
          </span>
          {downloadHref ? (
            <a
              href={downloadHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`screening-download-${result.id}`}
              className="inline-flex items-center gap-1 text-primary hover:underline min-h-[44px]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download
            </a>
          ) : null}
        </div>
      </div>

      {result.adverse_action_snippet ? (
        <div className="text-xs">
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
              className="mt-1 ml-5 text-muted-foreground whitespace-pre-wrap"
            >
              {result.adverse_action_snippet}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
