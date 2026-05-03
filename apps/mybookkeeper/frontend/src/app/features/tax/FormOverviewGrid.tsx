import { FileText, AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";
import { getFormLabel } from "@/shared/lib/tax-config";
import Badge from "@/shared/components/ui/Badge";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { ValidationResult } from "@/shared/types/tax/validation-result";
import type { FormSummary } from "@/shared/types/tax/form-summary";

interface Props {
  forms: FormSummary[];
  validationResults: ValidationResult[];
  onFormClick: (formName: string) => void;
}

function getValidationIcon(errors: number, warnings: number) {
  if (errors > 0) return <AlertCircle className="h-4 w-4 text-red-500" />;
  if (warnings > 0) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <CheckCircle2 className="h-4 w-4 text-green-500" />;
}

function getStatusBadge(errors: number, warnings: number): { label: string; color: BadgeColor } {
  if (errors > 0) return { label: `${errors} error${errors > 1 ? "s" : ""}`, color: "red" };
  if (warnings > 0) return { label: `${warnings} warning${warnings > 1 ? "s" : ""}`, color: "yellow" };
  return { label: "Valid", color: "green" };
}

export default function FormOverviewGrid({ forms, validationResults, onFormClick }: Props) {
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
        const formResults = validationResults.filter((v) => v.form_name === form.form_name);
        const errors = formResults.filter((v) => v.severity === "error").length;
        const warnings = formResults.filter((v) => v.severity === "warning").length;
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
