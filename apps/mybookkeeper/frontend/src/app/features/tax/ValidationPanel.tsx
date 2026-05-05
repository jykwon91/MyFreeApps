import { getFormLabel } from "@/shared/lib/tax-config";
import { formatCurrency } from "@/shared/utils/currency";
import type { ValidationResult } from "@/shared/types/tax/validation-result";
import { SEVERITY_ORDER, SEVERITY_CONFIG } from "@/shared/lib/validation-config";

export interface ValidationPanelProps {
  results: ValidationResult[];
  onNavigateToField: (formName: string, fieldId: string | null) => void;
}

export default function ValidationPanel({ results, onNavigateToField }: ValidationPanelProps) {
  if (results.length === 0) {
    return (
      <div className="border rounded-lg p-6 text-center text-muted-foreground">
        <p className="font-medium">All checks passed</p>
        <p className="text-sm mt-1">Everything looks good so far.</p>
      </div>
    );
  }

  const grouped = SEVERITY_ORDER
    .map((severity) => ({
      severity,
      items: results.filter((r) => r.severity === severity),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {grouped.map(({ severity, items }) => {
        const config = SEVERITY_CONFIG[severity];
        const Icon = config.icon;

        return (
          <div key={severity}>
            <h3 className="text-sm font-medium mb-2">
              {config.label} ({items.length})
            </h3>
            <div className="space-y-2">
              {items.map((result, i) => (
                <button
                  key={`${result.form_name}-${result.field_id}-${i}`}
                  onClick={() => onNavigateToField(result.form_name, result.field_id)}
                  className={`w-full text-left border rounded-lg px-4 py-3 flex items-start gap-3 transition-colors hover:opacity-80 ${config.containerClass}`}
                >
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.iconClass}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{getFormLabel(result.form_name)}</span>
                      {result.field_id ? (
                        <span className="text-muted-foreground">{result.field_id}</span>
                      ) : null}
                    </div>
                    <p className="text-sm mt-0.5">{result.message}</p>
                    {result.expected_value != null && result.actual_value != null ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        Expected {formatCurrency(result.expected_value)}, got {formatCurrency(result.actual_value)}
                      </p>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
