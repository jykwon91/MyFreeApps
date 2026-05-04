import type { Role } from "@/shared/types/user/role";
import type { EmailQueueStatus } from "@/shared/types/integration/email-queue";
import type { EmailQueueItem } from "@/shared/types/integration/email-queue";
import type { BadgeColor } from "@/shared/components/ui/Badge";

export const TAG_OPTIONS = [
  "rental_revenue",
  "cleaning_fee_revenue",
  "business_income",
  "security_deposit",
  "channel_fee",
  "cleaning_expense",
  "maintenance",
  "management_fee",
  "mortgage_interest",
  "mortgage_principal",
  "insurance",
  "utilities",
  "taxes",
  "other_expense",
  "contract_work",
  "advertising",
  "legal_professional",
  "travel",
  "furnishings",
  "supplies",
  "home_office",
  "meals",
  "vehicle_expenses",
  "health_insurance",
  "education_training",
] as const;

export const REVENUE_TAGS = new Set(["rental_revenue", "cleaning_fee_revenue", "business_income"]);
export const NEUTRAL_TAGS = new Set(["security_deposit"]);
export const EXPENSE_TAGS = new Set([
  "channel_fee", "cleaning_expense", "maintenance", "management_fee",
  "mortgage_interest", "mortgage_principal", "insurance", "utilities",
  "taxes", "other_expense", "contract_work", "advertising",
  "legal_professional", "travel", "furnishings",
  "supplies", "home_office", "meals", "vehicle_expenses",
  "health_insurance", "education_training",
]);
export const FINANCIAL_TAGS = new Set([...REVENUE_TAGS, ...EXPENSE_TAGS, ...NEUTRAL_TAGS]);

export const DOCUMENT_TYPES = [
  "invoice",
  "statement",
  "lease",
  "insurance_policy",
  "tax_form",
  "contract",
  "receipt",
  "year_end_statement",
  "w2",
  "1099",
  "1099_int",
  "1099_div",
  "1099_b",
  "1099_k",
  "1099_misc",
  "1099_nec",
  "1099_r",
  "1098",
  "k1",
  "other",
] as const;

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  statement: "Statement",
  lease: "Lease",
  insurance_policy: "Insurance",
  tax_form: "Tax Form",
  contract: "Contract",
  receipt: "Receipt",
  year_end_statement: "Year-End Statement",
  w2: "W-2",
  "1099": "1099",
  "1099_int": "1099-INT",
  "1099_div": "1099-DIV",
  "1099_b": "1099-B",
  "1099_k": "1099-K",
  "1099_misc": "1099-MISC",
  "1099_nec": "1099-NEC",
  "1099_r": "1099-R",
  "1098": "1098",
  k1: "K-1",
  other: "Other",
};

export const FINANCIAL_TYPES = new Set(["invoice", "statement"]);

export const DOCUMENT_TYPE_DETAIL_LABELS: Record<string, Record<string, string>> = {
  lease: {
    lease_start: "Lease Start",
    lease_end: "Lease End",
    monthly_rent: "Monthly Rent",
    tenant_name: "Tenant",
    security_deposit: "Security Deposit",
    lease_terms: "Terms",
  },
  insurance_policy: {
    policy_number: "Policy #",
    insurer: "Insurer",
    coverage_type: "Coverage",
    coverage_amount: "Coverage Amount",
    premium: "Premium",
    effective_date: "Effective",
    expiration_date: "Expiration",
  },
  tax_form: {
    form_type: "Form",
    tax_year: "Tax Year",
    payer: "Payer",
    recipient: "Recipient",
  },
  contract: {
    parties: "Parties",
    effective_date: "Effective",
    termination_date: "Termination",
    contract_value: "Value",
    contract_summary: "Summary",
  },
};

export const CURRENCY_FIELDS = new Set([
  "monthly_rent", "security_deposit", "coverage_amount", "premium", "contract_value",
]);

export const EXPENSE_CATEGORY_LIST = [
  "utilities",
  "maintenance",
  "management_fee",
  "insurance",
  "mortgage_interest",
  "mortgage_principal",
  "taxes",
  "cleaning_expense",
  "channel_fee",
  "advertising",
  "legal_professional",
  "travel",
  "other_expense",
  "contract_work",
  "furnishings",
  "supplies",
  "home_office",
  "meals",
  "vehicle_expenses",
  "health_insurance",
  "education_training",
] as const;

export const RECONCILIATION_STATUS_STYLES: Record<string, string> = {
  matched: "text-green-700 bg-green-50",
  confirmed: "text-green-700 bg-green-50",
  partial: "text-amber-700 bg-amber-50",
  mismatch: "text-amber-700 bg-amber-50",
  unmatched: "text-red-700 bg-red-50",
  missing: "text-red-700 bg-red-50",
};

export const TRANSACTION_CATEGORIES = [
  "rental_revenue",
  "cleaning_fee_revenue",
  "security_deposit",
  "maintenance",
  "contract_work",
  "cleaning_expense",
  "utilities",
  "management_fee",
  "insurance",
  "mortgage_interest",
  "mortgage_principal",
  "taxes",
  "channel_fee",
  "advertising",
  "legal_professional",
  "travel",
  "furnishings",
  "supplies",
  "home_office",
  "meals",
  "vehicle_expenses",
  "health_insurance",
  "education_training",
  "other_expense",
  "uncategorized",
] as const;

export const INCOME_CATEGORIES = ["rental_revenue", "cleaning_fee_revenue", "business_income", "uncategorized"] as const;
export const PAYMENT_METHODS = ["check", "credit_card", "bank_transfer", "cash", "platform_payout", "other"] as const;
export const CHANNELS = ["airbnb", "vrbo", "booking.com", "direct"] as const;

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export const TAG_COLORS: Record<string, string> = {
  rental_revenue: "#22c55e",
  cleaning_fee_revenue: "#86efac",
  security_deposit: "#4ade80",
  channel_fee: "#f97316",
  cleaning_expense: "#fb923c",
  maintenance: "#ef4444",
  management_fee: "#f43f5e",
  mortgage_interest: "#8b5cf6",
  mortgage_principal: "#7c3aed",
  insurance: "#a78bfa",
  utilities: "#06b6d4",
  taxes: "#0ea5e9",
  other_expense: "#94a3b8",
  contract_work: "#d946ef",
  advertising: "#ec4899",
  legal_professional: "#6366f1",
  travel: "#14b8a6",
  furnishings: "#f59e0b",
  business_income: "#10b981",
  supplies: "#f472b6",
  home_office: "#818cf8",
  meals: "#fb7185",
  vehicle_expenses: "#38bdf8",
  health_insurance: "#34d399",
  education_training: "#c084fc",
  uncategorized: "#9ca3af",
};

export const STATUS_BADGE: Readonly<Record<EmailQueueStatus, { label: string; color: BadgeColor }>> = {
  pending: { label: "Pending", color: "gray" },
  fetched: { label: "Fetched", color: "blue" },
  extracting: { label: "Extracting", color: "yellow" },
  done: { label: "Done", color: "green" },
  skipped: { label: "Skipped", color: "gray" },
  failed: { label: "Failed", color: "red" },
};

export interface NavItem {
  to: string;
  label: string;
  roles?: Role[];
  orgAdmin?: boolean;
}

export const UTILITY_SUB_CATEGORY_COLORS: Record<string, string> = {
  electricity: "#f59e0b",
  water: "#06b6d4",
  gas: "#ef4444",
  internet: "#8b5cf6",
  trash: "#84cc16",
  sewer: "#64748b",
};

export const UTILITY_SUB_CATEGORIES = ["electricity", "water", "gas", "internet", "trash", "sewer"] as const;

export const SUPPORTED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".zip"]);

export const POLLING_OPTIONS = { pollingInterval: 3000 } as const;

export const EMPTY_QUEUE: readonly EmailQueueItem[] = [];
