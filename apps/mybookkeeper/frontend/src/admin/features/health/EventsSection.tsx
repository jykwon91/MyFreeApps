import { CheckCircle2 } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import Badge from "@/shared/components/ui/Badge";
import EmptyState from "@/shared/components/ui/EmptyState";
import { timeAgo } from "@/shared/utils/date";
import type { SystemEvent } from "@/shared/types/health/health-summary";
import { SEVERITY_BADGE_COLOR } from "@/admin/features/health/severity";

type SeverityFilter = "all" | "info" | "warning" | "error" | "critical";
type TypeFilter = string;

const AUTO_RESOLVE_TYPES = new Set(["extraction_failed", "rate_limited"]);

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: "all", label: "All severities" },
  { value: "critical", label: "Critical" },
  { value: "error", label: "Error" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
];

interface EventsSectionProps {
  events: SystemEvent[];
  isLoading: boolean;
  eventTypes: string[];
  severityFilter: SeverityFilter;
  typeFilter: TypeFilter;
  onSeverityChange: (v: SeverityFilter) => void;
  onTypeChange: (v: TypeFilter) => void;
  onResolve: (id: string) => void;
  isResolving?: boolean;
}

export default function EventsSection({
  events,
  isLoading,
  eventTypes,
  severityFilter,
  typeFilter,
  onSeverityChange,
  onTypeChange,
  onResolve,
  isResolving = false,
}: EventsSectionProps) {
  return (
    <section className="flex-1 flex flex-col min-h-0 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <h2 className="text-base font-medium">Recent Activity</h2>
        <div className="flex gap-2">
          <select
            aria-label="Filter by severity"
            value={severityFilter}
            onChange={(e) => onSeverityChange(e.target.value as SeverityFilter)}
            className="border rounded-md px-3 py-1.5 text-sm bg-background"
          >
            {SEVERITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            aria-label="Filter by event type"
            value={typeFilter}
            onChange={(e) => onTypeChange(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm bg-background"
          >
            <option value="all">All types</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState message="No events match your filters" />
      ) : (
        <div className="border rounded-lg flex-1 overflow-auto min-h-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/95 backdrop-blur-sm">
              <tr className="border-b">
                <th className="text-left px-4 py-3 font-medium">Time</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Severity</th>
                <th className="text-left px-4 py-3 font-medium">Message</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={event.id}
                  className={cn(
                    "border-b last:border-b-0",
                    event.resolved && "opacity-50",
                  )}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {timeAgo(event.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={event.event_type.replace(/_/g, " ")} color="gray" />
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      label={event.severity}
                      color={SEVERITY_BADGE_COLOR[event.severity] ?? "gray"}
                    />
                  </td>
                  <td className={cn("px-4 py-3", event.resolved && "line-through")}>
                    {event.message}
                  </td>
                  <td className="px-4 py-3">
                    {event.resolved ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Resolved
                      </span>
                    ) : AUTO_RESOLVE_TYPES.has(event.event_type) ? (
                      <span className="text-xs text-muted-foreground">Auto-resolves</span>
                    ) : (
                      <button
                        onClick={() => onResolve(event.id)}
                        disabled={isResolving}
                        className="text-sm text-primary hover:underline disabled:opacity-50"
                      >
                        {isResolving ? "Resolving..." : "Resolve"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
