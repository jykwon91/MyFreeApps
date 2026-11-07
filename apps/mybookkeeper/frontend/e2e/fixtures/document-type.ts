// Mirrors the backend's DocumentType (app/schemas/system/admin.py); e2e code can't import app types.
export type DocumentType =
  | "invoice" | "statement" | "lease" | "insurance_policy" | "tax_form"
  | "contract" | "year_end_statement" | "receipt" | "other"
  | "w2" | "1099" | "1099_int" | "1099_div" | "1099_b" | "1099_k"
  | "1099_misc" | "1099_nec" | "1099_r" | "1098" | "k1";
