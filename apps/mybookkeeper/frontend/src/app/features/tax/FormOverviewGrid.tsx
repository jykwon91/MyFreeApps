import { FileText, AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";
import { getFormLabel } from "@mybookkeeper/api-client/utils/taxFormLabel";
import Badge from "@/shared/components/ui/Badge";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { FormSummary } from "@mybookkeeper/api-client/types/tax/FormSummary";
import { taxFormStatus } from "@mybookkeeper/api-client/utils/taxFormStatus";

export interface FormOverviewGridProps {
  forms: FormSummary[];
  onFormClick: (formName: string) => void;
}

function getValidationIcon(errors: number, warnings: number) {
  if (errors > 0) return <AlertCircle className="h-4 w-4 text-red-500" />;
  if (warnings > 0) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <CheckCircle2 className="h-4 w-4 text-green-500" />;
}

const STATUS_COLORS: Record<ReturnType<typeof taxFormStatus>["tone"], BadgeColor> = {
  error: "red",
  warning: "yellow",
  valid: "green",
};

function getStatusBadge(errors: number, warnings: number): { label: string; color: BadgeColor } {
  const status = taxFormStatus(errors, warnings);
  return { label: status.label, color: STATUS_COLORS[status.tone] };
}

export default function FormOverviewGrid({ forms, onFormClick }: FormOverviewGridProps) {
  if (forms.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium mb-1">No forms yet</p>
        <p className="text-sm">I haven't found any tax forms for this return. Try running a recompute.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {forms.map((form) => {
        const errors = form.error_count;
        const warnings = form.warning_count;
        const badge = getStatusBadge(errors, warnings);

        return (
          <button
            key={form.form_name}
            onClick={() => onFormClick(form.form_name)}
            className="border rounded-lg p-5 text-left hover:border-primary/50 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{getFormLabel(form.form_name)}</span>
              {getValidationIcon(errors, warnings)}
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {form.instance_count} instance{form.instance_count !== 1 ? "s" : ""}
              {" \u00b7 "}
              {form.field_count} field{form.field_count !== 1 ? "s" : ""}
            </p>
            <Badge label={badge.label} color={badge.color} />
          </button>
        );
      })}
    </div>
  );
}
