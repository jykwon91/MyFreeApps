/**
 * Fictional tenant + lease + rent schedule + rent-payment history for the
 * Bayou Bend Duplex, built to exercise the FIFO rent-ledger allocator:
 *
 *   Apr / May / Jun — paid in full (May arrives late, well past the grace
 *   period, but still shows as "paid" once fully allocated — the ledger
 *   doesn't track "paid late" as a separate status, only unpaid-past-grace).
 *   Jul — partial payment ($900 of $1,500) — shows "overdue" with $900
 *   allocated / $600 remaining once the grace period has passed.
 *   Aug — unpaid — shows "overdue".
 *   Sep — current period, unpaid, not yet past grace — shows "open".
 */
export const TENANT_NAME = "Jordan Ellis";

export const RENT_SCHEDULE = {
  amount: 1500.0,
  cadence: "monthly" as const,
  startDate: "2026-04-01",
  graceDays: 10,
};

export interface RentPaymentFixture {
  date: string;
  amount: number;
  description: string;
}

export const RENT_PAYMENTS: RentPaymentFixture[] = [
  { date: "2026-04-01", amount: 1500.0, description: "Rent — Bayou Bend Duplex Unit A (April)" },
  { date: "2026-05-20", amount: 1500.0, description: "Rent — Bayou Bend Duplex Unit A (May, paid late)" },
  { date: "2026-06-03", amount: 1500.0, description: "Rent — Bayou Bend Duplex Unit A (June)" },
  { date: "2026-07-15", amount: 900.0, description: "Rent — Bayou Bend Duplex Unit A (July, partial)" },
];
