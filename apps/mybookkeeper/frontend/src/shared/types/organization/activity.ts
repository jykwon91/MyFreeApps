export type ActivityType = 'rental_property' | 'self_employment' | 'investment' | 'w2_employment';
export type TaxForm = 'schedule_e' | 'schedule_c' | 'schedule_d' | 'w2';

export interface Activity {
  id: string;
  organization_id: string;
  activity_type: ActivityType;
  label: string;
  tax_form: TaxForm;
  property_id: string | null;
  is_active: boolean;
  created_at: string;
}
