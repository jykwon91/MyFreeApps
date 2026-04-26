import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { getFormLabel } from "@/app/features/tax/FormNameLabel";
import type { FormCompleteness } from "@/shared/types/tax/tax-completeness";

interface Props {
  form: FormCompleteness;
}

function completenessLabel(pct: number): string {
  if (pct === 100) return "Complete";
  if (pct >= 75) return "Almost there";
  if (pct >= 50) return "In progress";
  return "Needs attention";
}

export default function FormCompletenessCard({ form }: Props) {
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const pct = form.total_expected > 0
    ? Math.round((form.total_filled / form.total_expected) * 100)
    : 0;

  const isComplete = pct === 100;
  const hasMissing = form.missing_fields.length > 0;

  const headerLabel = form.instance_label
    ? `${getFormLabel(form.form_name)} — ${form.instance_label}`
    : getFormLabel(form.form_name);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={toggle}
        className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {isComplete ? (
              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
            )}
            <span className="font-medium text-sm truncate">{headerLabel}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={cn(
              "text-xs font-medium",
              isComplete ? "text-green-600" : "text-yellow-600",
            )}>
              {completenessLabel(pct)}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {form.total_filled}/{form.total_expected}
            </span>
            {expanded
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            }
          </div>
        </div>

        <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isComplete ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-400",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>

      {expanded ? (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          {form.highlights.length > 0 ? (
            <div className="space-y-1.5">
              {form.highlights.map((highlight, i) => (
                <p key={i} className="text-sm text-muted-foreground">{highlight}</p>
              ))}
            </div>
          ) : null}

          {form.filled_fields.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Found
              </p>
              <ul className="space-y-1">
                {form.filled_fields.map((field) => (
                  <li key={field} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    <span>{field}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {hasMissing ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Not found
              </p>
              <ul className="space-y-1">
                {form.missing_fields.map((field) => (
                  <li key={field} className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                    <span className="text-muted-foreground">{field}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
