/**
 * Per-dimension verdict grid.
 *
 * Renders one row per dimension key in canonical order. Each row shows:
 *   - Dimension label    ("Skill match", "Seniority", ...)
 *   - Status badge       (color-keyed via DIMENSION_STATUS_TONES)
 *   - Rationale          (1-2 sentences from Claude)
 *
 * Plus two flag lists below the grid (red flags, green flags). The
 * flags get their own styled list rather than another row because
 * they're free-form short strings — a row layout would chop them.
 *
 * Empty states:
 *   - No dimensions   → small placeholder (defensive; backend always
 *                       emits all five today, but enums drift)
 *   - No red flags    → list hidden
 *   - No green flags  → list hidden
 */
import { Badge } from "@platform/ui";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { JobAnalysisDimension } from "@/types/job-analysis/job-analysis-dimension";
import {
  DIMENSION_KEY_ORDER,
  DIMENSION_LABELS,
  DIMENSION_STATUS_LABELS,
  DIMENSION_STATUS_TONES,
} from "@/types/job-analysis/job-analysis-dimension";

interface DimensionsTableProps {
  dimensions: JobAnalysisDimension[];
  redFlags: string[];
  greenFlags: string[];
}

export default function DimensionsTable({
  dimensions,
  redFlags,
  greenFlags,
}: DimensionsTableProps) {
  // Defensive: render in canonical order regardless of array order
  // returned by the API. The backend already enforces this, but if
  // a caching middleware ever reorders we want stable display.
  const ordered = orderedDimensions(dimensions);

  if (ordered.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No analysis available — try analyzing again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-4 py-2 text-left font-semibold">
                Dimension
              </th>
              <th scope="col" className="px-4 py-2 text-left font-semibold">
                Status
              </th>
              <th scope="col" className="px-4 py-2 text-left font-semibold">
                Why
              </th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((row) => (
              <DimensionRow key={row.key} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {redFlags.length > 0 ? (
        <FlagList
          icon={<AlertTriangle size={16} aria-hidden="true" />}
          heading="Red flags"
          tone="red"
          items={redFlags}
        />
      ) : null}
      {greenFlags.length > 0 ? (
        <FlagList
          icon={<CheckCircle2 size={16} aria-hidden="true" />}
          heading="Green flags"
          tone="green"
          items={greenFlags}
        />
      ) : null}
    </div>
  );
}

function DimensionRow({ row }: { row: JobAnalysisDimension }) {
  const label = DIMENSION_LABELS[row.key] ?? row.key;
  const statusLabel = DIMENSION_STATUS_LABELS[row.status] ?? row.status;
  const tone = DIMENSION_STATUS_TONES[row.status] ?? "gray";
  return (
    <tr className="border-t">
      <td className="px-4 py-3 align-top font-medium whitespace-nowrap">
        {label}
      </td>
      <td className="px-4 py-3 align-top whitespace-nowrap">
        <Badge label={statusLabel} color={tone} />
      </td>
      <td className="px-4 py-3 align-top text-muted-foreground leading-relaxed">
        {row.rationale || "—"}
      </td>
    </tr>
  );
}

interface FlagListProps {
  icon: React.ReactNode;
  heading: string;
  tone: "red" | "green";
  items: string[];
}

function FlagList({ icon, heading, tone, items }: FlagListProps) {
  const containerClass =
    tone === "red"
      ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
      : "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30";
  const headingClass =
    tone === "red"
      ? "text-red-900 dark:text-red-200"
      : "text-green-900 dark:text-green-200";
  return (
    <div className={`rounded-md border p-3 ${containerClass}`}>
      <p
        className={`flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold ${headingClass}`}
      >
        {icon}
        {heading}
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function orderedDimensions(
  dimensions: JobAnalysisDimension[],
): JobAnalysisDimension[] {
  const lookup = new Map(dimensions.map((d) => [d.key, d]));
  const ordered: JobAnalysisDimension[] = [];
  for (const key of DIMENSION_KEY_ORDER) {
    const row = lookup.get(key);
    if (row) ordered.push(row);
  }
  // Append any unknown dimensions at the end so future enum additions
  // surface in the UI even if the type union hasn't caught up.
  for (const row of dimensions) {
    if (!DIMENSION_KEY_ORDER.includes(row.key)) {
      ordered.push(row);
    }
  }
  return ordered;
}
