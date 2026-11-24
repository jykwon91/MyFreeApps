import type { NetWorthLineSource } from "./net-worth-line-source";

/** One account, loan record or property, as ``GET /net-worth`` returns it. */
export interface NetWorthLine {
  source: NetWorthLineSource;
  id: string;
  name: string;
  /** The bank, the home a loan is on, or a property's address. */
  detail: string | null;
  /** Null until someone enters one; such a line is listed, not counted. */
  amount_cents: number | null;
  currency: string;
  as_of: string | null;
  is_stale: boolean;
  /** False when it has no value, or is in another currency than the total. */
  in_total: boolean;
}
