import { expect, type APIRequestContext } from "@playwright/test";
import { seedTypedDocument } from "./documents";

/**
 * Three tax forms across two years for the Tax Documents page. Seed into a
 * ``SoloOrg`` so nothing else adds documents or returns.
 */
export const TAX_DOCS_SEED = {
  forms: [
    { file: "e2e-doc-w2-acme.pdf", type: "w2", year: 2025, issuer: "Acme Staffing LLC", fields: { wages_tips_compensation: "52000.00" } },
    { file: "e2e-doc-int-credit-union.pdf", type: "1099_int", year: 2025, issuer: "First Credit Union", fields: { interest_income: "120.00" } },
    { file: "e2e-doc-int-harbor.pdf", type: "1099_int", year: 2024, issuer: "Harbor Bank", fields: { interest_income: "80.00" } },
  ],
} as const;

/** Files each form as extraction would, which also creates each year's return. */
export async function seedTaxDocuments(api: APIRequestContext): Promise<void> {
  for (const form of TAX_DOCS_SEED.forms) {
    const documentId = await seedTypedDocument(api, form.file, form.type);
    const res = await api.post("/test/seed-tax-source-document", {
      data: { document_id: documentId, document_type: form.type, tax_year: form.year, issuer_name: form.issuer, fields: form.fields },
    });
    expect(res.status(), await res.text()).toBe(201);
  }
}
