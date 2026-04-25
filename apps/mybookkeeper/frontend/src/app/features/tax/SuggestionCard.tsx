import { useState } from "react";
import { DollarSign, X, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/shared/utils/currency";
import Badge from "@/shared/components/ui/Badge";
import type { TaxAdvisorSuggestionRead } from "@/shared/types/tax/tax-advisor";
import { SEVERITY_CONFIG, CONFIDENCE_COLOR } from "@/shared/lib/tax-advisor-config";
import { useUpdateSuggestionStatusMutation } from "@/shared/store/taxReturnsApi";

interface SuggestionCardProps {
  suggestion: TaxAdvisorSuggestionRead;
  taxReturnId: string;
}

export default function SuggestionCard({ suggestion, taxReturnId }: SuggestionCardProps) {
  const [localStatus, setLocalStatus] = useState<"active" | "dismissed" | "resolved">(
    suggestion.status
  );
  const [updateStatus] = useUpdateSuggestionStatusMutation();

  const config = SEVERITY_CONFIG[suggestion.severity];
  const Icon = config.icon;

  const handleDismiss = () => {
    setLocalStatus("dismissed");
    updateStatus({ returnId: taxReturnId, suggestionId: suggestion.db_id, status: "dismissed" });
  };

  const handleResolve = () => {
    setLocalStatus("resolved");
    updateStatus({ returnId: taxReturnId, suggestionId: suggestion.db_id, status: "resolved" });
  };

  if (localStatus === "dismissed") {
    return null;
  }

  if (localStatus === "resolved") {
    return (
      <div className="border rounded-lg px-4 py-3 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="font-medium">{suggestion.title}</span>
        <span className="text-green-600 dark:text-green-500">— marked as resolved</span>
      </div>
    );
  }

  return (
    <div className={`border rounded-lg px-4 py-4 ${config.containerClass}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${config.iconClass}`} />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{suggestion.title}</span>
              <Badge label={config.label} color={config.badgeColor} />
              <Badge label={`${suggestion.confidence} confidence`} color={CONFIDENCE_COLOR[suggestion.confidence]} />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleResolve}
                title="Mark as resolved"
                className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900 text-muted-foreground hover:text-green-600 transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
              <button
                onClick={handleDismiss}
                title="Dismiss"
                className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <p className="text-sm">{suggestion.description}</p>

          {suggestion.estimated_savings != null ? (
            <p className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              Could save ~{formatCurrency(suggestion.estimated_savings)}
            </p>
          ) : null}

          <div className="bg-white/60 dark:bg-black/20 rounded px-3 py-2 text-sm">
            <span className="font-medium">Next step:</span> {suggestion.action}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {suggestion.irs_reference ? (
              <span className="text-xs text-muted-foreground">{suggestion.irs_reference}</span>
            ) : null}
            {suggestion.affected_form ? (
              <Badge label={suggestion.affected_form} color="gray" />
            ) : null}
            {suggestion.affected_properties?.map((prop) => (
              <span
                key={prop}
                className="inline-block px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground"
              >
                {prop}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
