import type { RentalRoiMortgageSource } from "../types/analytics/rental-roi-mortgage-source";

/** The URL param naming the property whose break-even breakdown is open. */
export const RENTAL_ROI_BREAKDOWN_PARAM = "breakdown";

/** Short names for the parts of a loan payment, which sit under a "Mortgage" heading. */
export const RENTAL_ROI_LOAN_LINE_LABELS: Readonly<Record<string, string>> = {
  mortgage_principal: "Principal",
  mortgage_interest: "Interest",
  mortgage_escrow: "Escrow",
};

/** Copy shared by the website's panel and the phone's details. */
export const RENTAL_ROI_BREAKDOWN_MESSAGES = {
  breakEven: "Break-even",
  mortgage: "Mortgage",
  operatingCosts: "Operating costs",
  noOperatingCosts: "No operating expenses recorded in this period.",
  escrowHeading: "Not counted: already paid by escrow",
  escrowNote: "Your mortgage escrow pays these, so counting the bills too would charge you twice.",
  capitalNote: "Expenses marked as a capital improvement are never counted.",
} as const;

export const RENTAL_ROI_MORTGAGE_SOURCE_NOTES: Readonly<Record<RentalRoiMortgageSource, string>> = {
  records: "From your loan record.",
  transactions: "Averaged from the mortgage payments in your transactions.",
  none: "No mortgage on file, so none is counted.",
};
