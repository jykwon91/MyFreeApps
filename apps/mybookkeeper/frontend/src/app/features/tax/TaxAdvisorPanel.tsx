import { Lightbulb, ShieldCheck, Info, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  useGetAdvisorSuggestionsQuery,
  useGenerateAdvisorSuggestionsMutation,
} from "@/shared/store/taxReturnsApi";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { SEVERITY_ORDER, SEVERITY_CONFIG } from "@/shared/lib/tax-advisor-config";
import SuggestionCard from "@/app/features/tax/SuggestionCard";
import TaxAdvisorPanelSkeleton from "@/app/features/tax/TaxAdvisorPanelSkeleton";

export interface TaxAdvisorPanelProps {
  taxReturnId: string;
  formCount: number;
}

export default function TaxAdvisorPanel({ taxReturnId, formCount }: TaxAdvisorPanelProps) {
  const {
    data: cached,
    isLoading: isCacheLoading,
    error: cacheError,
  } = useGetAdvisorSuggestionsQuery(taxReturnId);

  const [generate, { isLoading: isGenerating, error: generateError }] =
    useGenerateAdvisorSuggestionsMutation();

  const handleGenerate = () => {
    generate(taxReturnId);
  };

  // No forms to review — show guidance instead of the advisor button
  if (formCount === 0) {
    return (
      <div className="border rounded-lg p-6 text-center">
        <Lightbulb className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          I don't have any tax forms to review yet. Upload your W-2s, 1099s, or other documents and I'll have something to work with.
        </p>
      </div>
    );
  }

  // Show skeleton only while Claude is generating (cache fetch is fast)
  if (isGenerating) {
    return <TaxAdvisorPanelSkeleton />;
  }

  // Cache fetch in progress (brief — no skeleton needed, but handle the case)
  if (isCacheLoading) {
    return null;
  }

  // No cached suggestions yet (404 or empty) — show CTA
  const hasCached = cached && cached.suggestions.length > 0;
  const is404 = cacheError && "status" in cacheError && cacheError.status === 404;
  const noCachedSuggestions = !cached || (is404 as boolean);

  if (noCachedSuggestions) {
    const is429 = generateError && "status" in generateError && generateError.status === 429;
    return (
      <div className="border rounded-lg p-6 text-center">
        <Lightbulb className="h-8 w-8 mx-auto mb-3 text-yellow-500" />
        <p className="text-sm text-muted-foreground mb-4">
          {is429
            ? "I've already reviewed this return several times today. Check back tomorrow."
            : generateError
            ? "I ran into a problem reviewing your tax data. Want me to try again?"
            : "I can review your tax return and suggest ways to save money or fix potential issues."}
        </p>
        {!is429 && (
          <LoadingButton onClick={handleGenerate} isLoading={isGenerating} loadingText="Reviewing...">
            Get Tax Advice
          </LoadingButton>
        )}
      </div>
    );
  }

  // Cached suggestions exist but all are empty (Claude returned no issues)
  if (!hasCached) {
    return (
      <div className="border rounded-lg p-6 text-center text-muted-foreground">
        <ShieldCheck className="h-8 w-8 mx-auto mb-3 text-green-500" />
        <p className="font-medium">Your tax data looks good! No issues found.</p>
        <p className="text-sm mt-1">Everything checks out from what I can see.</p>
        <div className="mt-4">
          <LoadingButton
            onClick={handleGenerate}
            isLoading={isGenerating}
            loadingText="Reviewing..."
            variant="secondary"
            size="sm"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Regenerate
          </LoadingButton>
        </div>
      </div>
    );
  }

  const activesuggestions = cached.suggestions.filter((s) => s.status !== "dismissed");

  const grouped = SEVERITY_ORDER
    .map((severity) => ({
      severity,
      items: activesuggestions.filter((s) => s.severity === severity),
    }))
    .filter((g) => g.items.length > 0);

  const generatedAt = cached.generated_at
    ? format(parseISO(cached.generated_at), "MMM d, yyyy 'at' h:mm a")
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {generatedAt && (
          <p className="text-xs text-muted-foreground">Generated on {generatedAt}</p>
        )}
        <LoadingButton
          onClick={handleGenerate}
          isLoading={isGenerating}
          loadingText="Reviewing..."
          variant="ghost"
          size="sm"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Regenerate
        </LoadingButton>
      </div>

      {grouped.length === 0 ? (
        <div className="border rounded-lg p-6 text-center text-muted-foreground">
          <ShieldCheck className="h-8 w-8 mx-auto mb-3 text-green-500" />
          <p className="font-medium">All suggestions resolved or dismissed.</p>
        </div>
      ) : (
        grouped.map(({ severity, items }) => (
          <div key={severity}>
            <h3 className="text-sm font-medium mb-2">
              {SEVERITY_CONFIG[severity].label} Priority ({items.length})
            </h3>
            <div className="space-y-3">
              {items.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.db_id}
                  suggestion={suggestion}
                  taxReturnId={taxReturnId}
                />
              ))}
            </div>
          </div>
        ))
      )}

      <div className="border-t pt-3 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p>{cached.disclaimer}</p>
      </div>
    </div>
  );
}
