/**
 * ~6 months (Apr-Sep 2026) of fictional operating transactions for the two
 * demo properties. Category-diverse on purpose so dashboard/summary charts
 * have something to show besides a single bar.
 *
 * Rent income for Bayou Bend Duplex is intentionally NOT here — it comes
 * from the tenant/rent-ledger flow in fixtures/mbk/tenant.ts, attributed to
 * the demo applicant so the FIFO allocator has something to allocate. The
 * water-heater replacement at Bayou Bend Duplex is also intentionally NOT
 * here — it is produced by real Claude extraction from the uploaded fake
 * invoice (fixtures/mbk/invoice.ts), not pre-seeded, so it isn't duplicated.
 */
export interface TransactionFixture {
  propertyName: string;
  date: string; // YYYY-MM-DD
  vendor: string;
  description: string;
  amount: number;
  transactionType: "income" | "expense";
  category: string;
  subCategory?: string;
  scheduleELine?: string;
  tags?: string[];
  taxRelevant?: boolean;
}

const BAYOU = "Bayou Bend Duplex";
const OXFORD = "Oxford Street Bungalow";

export const TRANSACTIONS: TransactionFixture[] = [
  // --- Bayou Bend Duplex: mortgage interest, monthly ---
  { propertyName: BAYOU, date: "2026-04-05", vendor: "Gulf Coast Mortgage Servicing", description: "Mortgage interest — April", amount: 612.34, transactionType: "expense", category: "mortgage_interest", scheduleELine: "line_12_mortgage_interest", taxRelevant: true },
  { propertyName: BAYOU, date: "2026-05-05", vendor: "Gulf Coast Mortgage Servicing", description: "Mortgage interest — May", amount: 609.87, transactionType: "expense", category: "mortgage_interest", scheduleELine: "line_12_mortgage_interest", taxRelevant: true },
  { propertyName: BAYOU, date: "2026-06-05", vendor: "Gulf Coast Mortgage Servicing", description: "Mortgage interest — June", amount: 607.38, transactionType: "expense", category: "mortgage_interest", scheduleELine: "line_12_mortgage_interest", taxRelevant: true },
  { propertyName: BAYOU, date: "2026-07-05", vendor: "Gulf Coast Mortgage Servicing", description: "Mortgage interest — July", amount: 604.86, transactionType: "expense", category: "mortgage_interest", scheduleELine: "line_12_mortgage_interest", taxRelevant: true },
  { propertyName: BAYOU, date: "2026-08-05", vendor: "Gulf Coast Mortgage Servicing", description: "Mortgage interest — August", amount: 602.32, transactionType: "expense", category: "mortgage_interest", scheduleELine: "line_12_mortgage_interest", taxRelevant: true },
  { propertyName: BAYOU, date: "2026-09-05", vendor: "Gulf Coast Mortgage Servicing", description: "Mortgage interest — September", amount: 599.76, transactionType: "expense", category: "mortgage_interest", scheduleELine: "line_12_mortgage_interest", taxRelevant: true },

  // --- Bayou Bend Duplex: property management fee, monthly ---
  { propertyName: BAYOU, date: "2026-04-07", vendor: "Bayou Property Management", description: "Management fee — April", amount: 135.0, transactionType: "expense", category: "management_fee", scheduleELine: "line_8_commissions", taxRelevant: true },
  { propertyName: BAYOU, date: "2026-05-07", vendor: "Bayou Property Management", description: "Management fee — May", amount: 135.0, transactionType: "expense", category: "management_fee", scheduleELine: "line_8_commissions", taxRelevant: true },
  { propertyName: BAYOU, date: "2026-06-07", vendor: "Bayou Property Management", description: "Management fee — June", amount: 135.0, transactionType: "expense", category: "management_fee", scheduleELine: "line_8_commissions", taxRelevant: true },
  { propertyName: BAYOU, date: "2026-07-07", vendor: "Bayou Property Management", description: "Management fee — July", amount: 135.0, transactionType: "expense", category: "management_fee", scheduleELine: "line_8_commissions", taxRelevant: true },
  { propertyName: BAYOU, date: "2026-08-07", vendor: "Bayou Property Management", description: "Management fee — August", amount: 135.0, transactionType: "expense", category: "management_fee", scheduleELine: "line_8_commissions", taxRelevant: true },
  { propertyName: BAYOU, date: "2026-09-07", vendor: "Bayou Property Management", description: "Management fee — September", amount: 135.0, transactionType: "expense", category: "management_fee", scheduleELine: "line_8_commissions", taxRelevant: true },

  // --- Bayou Bend Duplex: common-area electric, monthly ---
  { propertyName: BAYOU, date: "2026-04-12", vendor: "CenterPoint Energy", description: "Common-area electric — April", amount: 78.42, transactionType: "expense", category: "utilities", subCategory: "electricity", scheduleELine: "line_17_utilities", taxRelevant: true },
  { propertyName: BAYOU, date: "2026-05-12", vendor: "CenterPoint Energy", description: "Common-area electric — May", amount: 84.19, transactionType: "expense", category: "utilities", subCategory: "electricity", scheduleELine: "line_17_utilities", taxRelevant: true },
  { propertyName: BAYOU, date: "2026-06-12", vendor: "CenterPoint Energy", description: "Common-area electric — June", amount: 96.55, transactionType: "expense", category: "utilities", subCategory: "electricity", scheduleELine: "line_17_utilities", taxRelevant: true },
  { propertyName: BAYOU, date: "2026-07-12", vendor: "CenterPoint Energy", description: "Common-area electric — July", amount: 103.28, transactionType: "expense", category: "utilities", subCategory: "electricity", scheduleELine: "line_17_utilities", taxRelevant: true },
  { propertyName: BAYOU, date: "2026-08-12", vendor: "CenterPoint Energy", description: "Common-area electric — August", amount: 99.71, transactionType: "expense", category: "utilities", subCategory: "electricity", scheduleELine: "line_17_utilities", taxRelevant: true },

  // --- Bayou Bend Duplex: insurance, quarterly ---
  { propertyName: BAYOU, date: "2026-04-10", vendor: "Texas Farm Bureau Insurance", description: "Landlord policy premium — Q2", amount: 512.0, transactionType: "expense", category: "insurance", scheduleELine: "line_9_insurance", taxRelevant: true },
  { propertyName: BAYOU, date: "2026-07-10", vendor: "Texas Farm Bureau Insurance", description: "Landlord policy premium — Q3", amount: 512.0, transactionType: "expense", category: "insurance", scheduleELine: "line_9_insurance", taxRelevant: true },

  // --- Bayou Bend Duplex: property tax, one installment ---
  { propertyName: BAYOU, date: "2026-07-31", vendor: "Harris County Tax Assessor", description: "Property tax installment", amount: 2140.0, transactionType: "expense", category: "taxes", scheduleELine: "line_16_taxes", taxRelevant: true },

  // --- Bayou Bend Duplex: one pre-seeded maintenance event (the second is produced by AI extraction) ---
  { propertyName: BAYOU, date: "2026-06-18", vendor: "Bayou City Plumbing & HVAC", description: "AC condenser repair — Unit B", amount: 340.0, transactionType: "expense", category: "maintenance", scheduleELine: "line_14_repairs", taxRelevant: true },

  // --- Oxford Street Bungalow: rent income, monthly (direct tenant, no ledger) ---
  { propertyName: OXFORD, date: "2026-04-01", vendor: "Morgan Patel", description: "Monthly rent", amount: 1750.0, transactionType: "income", category: "rental_revenue", scheduleELine: "line_3_rents_received", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-05-01", vendor: "Morgan Patel", description: "Monthly rent", amount: 1750.0, transactionType: "income", category: "rental_revenue", scheduleELine: "line_3_rents_received", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-06-01", vendor: "Morgan Patel", description: "Monthly rent", amount: 1750.0, transactionType: "income", category: "rental_revenue", scheduleELine: "line_3_rents_received", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-07-01", vendor: "Morgan Patel", description: "Monthly rent", amount: 1750.0, transactionType: "income", category: "rental_revenue", scheduleELine: "line_3_rents_received", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-08-01", vendor: "Morgan Patel", description: "Monthly rent", amount: 1750.0, transactionType: "income", category: "rental_revenue", scheduleELine: "line_3_rents_received", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-09-01", vendor: "Morgan Patel", description: "Monthly rent", amount: 1750.0, transactionType: "income", category: "rental_revenue", scheduleELine: "line_3_rents_received", taxRelevant: true },

  // --- Oxford Street Bungalow: mortgage interest, monthly ---
  { propertyName: OXFORD, date: "2026-04-03", vendor: "Gulf Coast Mortgage Servicing", description: "Mortgage interest — April", amount: 540.22, transactionType: "expense", category: "mortgage_interest", scheduleELine: "line_12_mortgage_interest", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-05-03", vendor: "Gulf Coast Mortgage Servicing", description: "Mortgage interest — May", amount: 538.1, transactionType: "expense", category: "mortgage_interest", scheduleELine: "line_12_mortgage_interest", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-06-03", vendor: "Gulf Coast Mortgage Servicing", description: "Mortgage interest — June", amount: 535.96, transactionType: "expense", category: "mortgage_interest", scheduleELine: "line_12_mortgage_interest", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-07-03", vendor: "Gulf Coast Mortgage Servicing", description: "Mortgage interest — July", amount: 533.79, transactionType: "expense", category: "mortgage_interest", scheduleELine: "line_12_mortgage_interest", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-08-03", vendor: "Gulf Coast Mortgage Servicing", description: "Mortgage interest — August", amount: 531.6, transactionType: "expense", category: "mortgage_interest", scheduleELine: "line_12_mortgage_interest", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-09-03", vendor: "Gulf Coast Mortgage Servicing", description: "Mortgage interest — September", amount: 529.38, transactionType: "expense", category: "mortgage_interest", scheduleELine: "line_12_mortgage_interest", taxRelevant: true },

  // --- Oxford Street Bungalow: HOA dues, monthly ---
  { propertyName: OXFORD, date: "2026-04-01", vendor: "Oxford Heights HOA", description: "Monthly HOA dues", amount: 65.0, transactionType: "expense", category: "other_expense", tags: ["hoa"], scheduleELine: "line_19_other", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-05-01", vendor: "Oxford Heights HOA", description: "Monthly HOA dues", amount: 65.0, transactionType: "expense", category: "other_expense", tags: ["hoa"], scheduleELine: "line_19_other", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-06-01", vendor: "Oxford Heights HOA", description: "Monthly HOA dues", amount: 65.0, transactionType: "expense", category: "other_expense", tags: ["hoa"], scheduleELine: "line_19_other", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-07-01", vendor: "Oxford Heights HOA", description: "Monthly HOA dues", amount: 65.0, transactionType: "expense", category: "other_expense", tags: ["hoa"], scheduleELine: "line_19_other", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-08-01", vendor: "Oxford Heights HOA", description: "Monthly HOA dues", amount: 65.0, transactionType: "expense", category: "other_expense", tags: ["hoa"], scheduleELine: "line_19_other", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-09-01", vendor: "Oxford Heights HOA", description: "Monthly HOA dues", amount: 65.0, transactionType: "expense", category: "other_expense", tags: ["hoa"], scheduleELine: "line_19_other", taxRelevant: true },

  // --- Oxford Street Bungalow: insurance, quarterly ---
  { propertyName: OXFORD, date: "2026-04-15", vendor: "Texas Farm Bureau Insurance", description: "Landlord policy premium — Q2", amount: 388.0, transactionType: "expense", category: "insurance", scheduleELine: "line_9_insurance", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-07-15", vendor: "Texas Farm Bureau Insurance", description: "Landlord policy premium — Q3", amount: 388.0, transactionType: "expense", category: "insurance", scheduleELine: "line_9_insurance", taxRelevant: true },

  // --- Oxford Street Bungalow: property tax, one installment ---
  { propertyName: OXFORD, date: "2026-07-31", vendor: "Harris County Tax Assessor", description: "Property tax installment", amount: 1620.0, transactionType: "expense", category: "taxes", scheduleELine: "line_16_taxes", taxRelevant: true },

  // --- Oxford Street Bungalow: maintenance, two events ---
  { propertyName: OXFORD, date: "2026-05-09", vendor: "Houston Home Services", description: "Gutter cleaning", amount: 150.0, transactionType: "expense", category: "maintenance", scheduleELine: "line_14_repairs", taxRelevant: true },
  { propertyName: OXFORD, date: "2026-08-02", vendor: "Houston Home Services", description: "Fence repair — backyard", amount: 275.0, transactionType: "expense", category: "maintenance", scheduleELine: "line_14_repairs", taxRelevant: true },
];
