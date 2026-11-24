/** A personal spending category, shared by all members of an org. */
export interface SpendingCategory {
  id: string;
  organization_id: string;
  name: string;
  is_default: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
