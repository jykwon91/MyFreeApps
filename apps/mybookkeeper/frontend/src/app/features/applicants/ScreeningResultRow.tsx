import { ExternalLink } from "lucide-react";
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from "@/shared/lib/inquiry-date-format";
import Badge from "@/shared/components/ui/Badge";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { ScreeningResult } from "@/shared/types/applicant/screening-result";

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

interface Props {
  result: ScreeningResult;
}

/**
 * Single screening attempt row. Shows provider, status badge, request /
 * completion timestamps, and a "View report" link IFF a
 * ``report_storage_key`` is set. Per RENTALS_PLAN.md §9.1, the full report
 * is NEVER inlined — only the link.
 */
export default function ScreeningResultRow({ result }: Props) {
  const statusMeta = STATUS_BADGE[result.status] ?? {
    label: result.status,
    color: "gray" as BadgeColor,
  };
  const providerLabel = PROVIDER_LABELS[result.provider] ?? result.provider;
  const completed = result.completed_at
    ? formatRelativeTime(result.completed_at)
    : "In progress";
  const reportHref = result.report_storage_key
    ? `/api/storage/${result.report_storage_key}`
    : null;

  return (
    <li
      data-testid={`screening-result-${result.id}`}
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b last:border-b-0 py-3"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Badge label={statusMeta.label} color={statusMeta.color} />
        <span className="font-medium text-sm truncate">{providerLabel}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span title={formatAbsoluteTime(result.requested_at)}>
          Requested {formatRelativeTime(result.requested_at)}
        </span>
        <span aria-hidden="true">·</span>
        <span>{completed}</span>
        {reportHref ? (
          <a
            href={reportHref}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`screening-report-link-${result.id}`}
            className="inline-flex items-center gap-1 text-primary hover:underline min-h-[44px]"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            View report
          </a>
        ) : null}
      </div>
    </li>
  );
}
