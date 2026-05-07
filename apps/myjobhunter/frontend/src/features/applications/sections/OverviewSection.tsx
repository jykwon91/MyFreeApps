/**
 * Overview section of the ApplicationDrawer (and reused by ApplicationDetail).
 *
 * Per UX review: shows JD summary, source URL, location, salary range,
 * remote type, applied date. Excludes ``external_ref``, ``created_at``,
 * ``updated_at`` — operational noise the operator never acts on.
 */
import { ExternalLink as ExternalLinkIcon } from "lucide-react";
import { formatSalaryRange } from "@platform/ui";
import type { Application } from "@/types/application";

interface OverviewSectionProps {
  application: Application;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface FieldProps {
  label: string;
  value: string | React.ReactNode;
}

function Field({ label, value }: FieldProps) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

export default function OverviewSection({ application }: OverviewSectionProps) {
  const remoteLabel =
    application.remote_type !== "unknown" ? application.remote_type : "—";
  const salary = formatSalaryRange(
    application.posted_salary_min,
    application.posted_salary_max,
    application.posted_salary_currency,
    application.posted_salary_period,
  );

  return (
    <section className="space-y-4">
      {application.url ? (
        <div>
          <a
            href={application.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
          >
            <ExternalLinkIcon size={14} aria-hidden="true" />
            {application.url}
          </a>
        </div>
      ) : null}

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Field label="Applied" value={formatDate(application.applied_at)} />
        <Field
          label="Fit score"
          value={application.fit_score ? `${application.fit_score}%` : "—"}
        />
        <Field label="Posted salary" value={salary} />
        <Field label="Location" value={application.location ?? "—"} />
        <Field label="Remote" value={remoteLabel} />
        <Field label="Source" value={application.source ?? "—"} />
      </dl>
    </section>
  );
}
