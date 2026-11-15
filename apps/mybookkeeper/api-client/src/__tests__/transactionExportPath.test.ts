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
        tax_relevant: false,
        sort_by: "amount",
        sort_dir: "asc",
      }),
    ).toBe(
      "/exports/transactions/csv?property_id=p1&unassigned=true&applicant_id=a1&status=approved&to_review=true&transaction_type=expense&category=maintenance&vendor=Home%20Depot&start_date=2026-01-01&end_date=2026-01-31&tax_year=2026&tax_relevant=false&sort_by=amount&sort_dir=asc",
    );
  });

  it("is bare with no filters, and skips empty or switched-off ones", () => {
    expect(transactionExportPath("pdf", { category: "", to_review: false, unassigned: false })).toBe("/exports/transactions/pdf");
  });

  it("repeats a key for each value of a list filter, and never sends a row limit", () => {
    expect(
      transactionExportPath("csv", {
        statuses: ["pending", "needs_review"],
        transaction_types: ["income"],
        categories: ["rent"],
        property_ids: ["p1", "unassigned"],
        sort_by: "tax_relevant",
        limit: 25,
      }),
    ).toBe(
      "/exports/transactions/csv?statuses=pending&statuses=needs_review&transaction_types=income&categories=rent&property_ids=p1&property_ids=unassigned&sort_by=tax_relevant",
    );
  });

  it("carries a multi-column order as repeated sort keys", () => {
    expect(transactionExportPath("csv", { vendor: "Depot", sort: ["vendor:asc", "amount:desc"] })).toBe(
      "/exports/transactions/csv?vendor=Depot&sort=vendor%3Aasc&sort=amount%3Adesc",
    );
  });

  it("escapes values", () => {
    expect(transactionExportPath("csv", { vendor: "A&B" })).toBe("/exports/transactions/csv?vendor=A%26B");
  });
});
