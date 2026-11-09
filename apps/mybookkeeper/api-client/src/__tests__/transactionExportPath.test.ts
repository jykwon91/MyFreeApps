import { describe, expect, it } from "vitest";
import { transactionExportPath } from "../utils/transactionExportPath";

describe("transactionExportPath", () => {
  it("sends every filter the list reads", () => {
    expect(
      transactionExportPath("csv", {
        property_id: "p1",
        applicant_id: "a1",
        status: "approved",
        transaction_type: "expense",
        category: "maintenance",
        vendor: "Home Depot",
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        tax_year: 2026,
        unassigned: true,
        to_review: true,
      }),
    ).toBe(
      "/exports/transactions/csv?property_id=p1&unassigned=true&applicant_id=a1&status=approved&to_review=true&transaction_type=expense&category=maintenance&vendor=Home%20Depot&start_date=2026-01-01&end_date=2026-01-31&tax_year=2026",
    );
  });

  it("is bare with no filters, and skips empty or switched-off ones", () => {
    expect(transactionExportPath("pdf", { category: "", to_review: false, unassigned: false })).toBe("/exports/transactions/pdf");
  });

  it("escapes values", () => {
    expect(transactionExportPath("csv", { vendor: "A&B" })).toBe("/exports/transactions/csv?vendor=A%26B");
  });
});
