export interface PlaidAccount {
  id: string;
  plaid_item_id: string;
  name: string;
  official_name: string | null;
  account_type: string;
  account_subtype: string | null;
  mask: string | null;
  property_id: string | null;
  is_active: boolean;
}
