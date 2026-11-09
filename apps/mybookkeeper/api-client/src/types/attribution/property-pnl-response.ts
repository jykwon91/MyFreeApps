import type { PropertyPnLEntry } from "./property-pnl-entry";

export interface PropertyPnLResponse {
  since: string;
  until: string;
  properties: PropertyPnLEntry[];
  total_revenue_cents: number;
  total_expenses_cents: number;
  total_net_cents: number;
}
