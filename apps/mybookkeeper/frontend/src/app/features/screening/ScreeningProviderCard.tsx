import { Clock, DollarSign, ExternalLink } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import type { ScreeningProviderInfo } from "@mybookkeeper/api-client/types/applicant/screening-provider-info";

export interface ScreeningProviderCardProps {
  provider: ScreeningProviderInfo;
  isLoading: boolean;
  /** True while any provider's redirect is opening, so no second card can start one. */
  disabled: boolean;
  onSelect: (providerName: string) => void;
}

/**
 * A single provider card in the screening provider grid.
 *
 * Shows: name, description, cost, turnaround time, and a "Start screening"
 * CTA. The CTA triggers the redirect flow for this specific provider.
 *
 * ``isLoading`` marks the card whose redirect is opening; ``disabled`` is set
 * on every card meanwhile, so a second click on another card can't open a
 * second dashboard.
 */
export default function ScreeningProviderCard({ provider, isLoading, disabled, onSelect }: ScreeningProviderCardProps) {
  return (
    <div
      data-testid={`screening-provider-card-${provider.name}`}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div>
        <h3 className="text-sm font-semibold">{provider.label}</h3>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {provider.description}
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <DollarSign className="h-3 w-3" aria-hidden="true" />
          {provider.cost_label}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {provider.turnaround_label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <a
          href={provider.external_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground min-h-[44px]"
          data-testid={`screening-provider-learn-more-${provider.name}`}
          aria-label={`Learn more about ${provider.label}`}
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          Learn more
        </a>

        <LoadingButton
          data-testid={`screening-provider-select-${provider.name}`}
          variant="primary"
          size="sm"
          isLoading={isLoading}
          loadingText="Opening..."
          onClick={() => onSelect(provider.name)}
          disabled={disabled}
        >
          Start screening
        </LoadingButton>
      </div>
    </div>
  );
}
