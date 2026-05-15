/**
 * Customer-DB types -- mirrors backend schemas at
 * apps/mypizzatracker/backend/app/schemas/customer/customer_schemas.py
 */

export interface CustomerListItem {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  order_count: number;
  last_order_at: string | null; // ISO timestamp
}

export interface CustomerRead {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerNotesUpdate {
  notes: string | null;
}
