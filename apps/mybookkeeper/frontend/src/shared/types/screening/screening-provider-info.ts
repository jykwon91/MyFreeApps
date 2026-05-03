/**
 * Mirrors backend ``ScreeningProviderInfo`` — one entry in the provider grid.
 *
 * ``name`` is the canonical identifier used in API calls.
 * ``external_url`` is the provider's public site, shown as a fallback link.
 */
export interface ScreeningProviderInfo {
  name: string;
  label: string;
  description: string;
  cost_label: string;
  turnaround_label: string;
  external_url: string;
}

export interface ScreeningProvidersResponse {
  providers: ScreeningProviderInfo[];
}
