export interface TaxProfile {
  id: string;
  organization_id: string;
  tax_situations: string[];
  dependents_count: number;
  onboarding_completed: boolean;
}
