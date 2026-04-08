export interface ClassificationRule {
  id: string;
  organization_id: string;
  match_type: string;
  match_pattern: string;
  match_context: string | null;
  category: string;
  property_id: string | null;
  activity_id: string | null;
  source: string;
  priority: number;
  times_applied: number;
  is_active: boolean;
  created_at: string;
}
