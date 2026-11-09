import type { TaxReportView } from "../types/TaxReportView";

export const TAX_REPORT_VIEWS: readonly { value: TaxReportView; label: string }[] = [
  { value: "categories", label: "Categories" },
  { value: "properties", label: "Properties" },
  { value: "w2", label: "W-2" },
];

export const TAX_YEARS_SHOWN = 3;
export const UNCATEGORIZED_CATEGORY = "uncategorized";
export const UNASSIGNED_PROPERTY_NAME = "Unassigned";
export const TAX_REPORT_SKELETON_ROWS = [0, 1, 2, 3, 4, 5] as const;

export const TAX_REPORT_MESSAGES = {
  loading: "Loading your tax report",
  year: "Tax year",
  yearHint: "Chooses which year to show",
  viewLabel: "Show amounts by",
  netIncome: "Net rental income",
  revenue: "Revenue",
  deductions: "Deductions",
  wages: "W-2 wages",
  totalIncomeWithWages: "Total income with W-2 wages",
  unknownEmployer: "Unknown employer",
  withheld: (federal: string, state: string) => `Withheld: federal ${federal}, state ${state}`,
  ein: (ein: string) => `EIN ${ein}`,
  wagesNote: "Not part of net rental income.",
  approvedOnly: "Only approved, tax-relevant transactions count.",
  notDeductible: "Not deductible",
  notCounted: "Not income or a deduction",
  shareTitle: "Share",
  shareNote: "The Schedule E PDF goes by tax year and only includes amounts on a Schedule E line, so its totals can differ from these.",
  preparing: "Preparing...",
  tooManyExports: "I've made a lot of exports this hour. Try again in a bit.",
  couldntExport: "I couldn't make that PDF. Please try again in a bit.",
  tryAgain: "Try again",
  checkConnection: "Check your connection.",
  tryAgainLater: "Please try again in a bit.",
  noneBodyWriter: "When I have approved transactions marked tax-relevant, they'll show up here. Take a photo of a receipt to add one.",
  noneBodyViewer: "When approved transactions marked tax-relevant are added, they'll show up here.",
  takePhoto: "Take a photo",
  couldntLoad: (year: number) => `I couldn't load your ${year} taxes.`,
  noneHeading: (year: number) => `I don't see any approved tax transactions for ${year}.`,
  uncategorized: (amount: string) => `I found ${amount} I couldn't categorize. Please review before filing.`,
} as const;
