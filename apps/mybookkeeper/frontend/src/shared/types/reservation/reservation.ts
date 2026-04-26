export interface Reservation {
  id: string;
  organization_id: string;
  property_id: string | null;
  transaction_id: string | null;
  res_code: string;
  platform: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  gross_booking: string | null;
  net_booking_revenue: string | null;
  commission: string | null;
  cleaning_fee: string | null;
  insurance_fee: string | null;
  net_client_earnings: string | null;
  funds_due_to_client: string | null;
  guest_name: string | null;
  statement_period_start: string | null;
  statement_period_end: string | null;
  created_at: string;
}
