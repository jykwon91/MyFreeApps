import { describe, expect, it } from "vitest";
import { transactionExportPath } from "../utils/transactionExportPath";

describe("transactionExportPath", () => {
  it("sends the filters the export reads", () => {
    expect(transactionExportPath("csv", { property_id: "p1", status: "approved", start_date: "2026-01-01", end_date: "2026-01-31" })).toBe(
      "/exports/transactions/csv?property_id=p1&status=approved&start_date=2026-01-01&end_date=2026-01-31",
    );
  });

  it("is bare with no filters, and skips empty ones and ones the export doesn't read", () => {
    expect(transactionExportPath("pdf", { category: "", to_review: true, unassigned: true })).toBe("/exports/transactions/pdf");
  });

  it("escapes values", () => {
    expect(transactionExportPath("csv", { vendor: "A&B" })).toBe("/exports/transactions/csv?vendor=A%26B");
  });
});
