import { describe, it, expect } from "vitest";
import { useReconciliationSourcesMode } from "@/app/features/reconciliation/useReconciliationSourcesMode";
import { useReconciliationDiscrepanciesMode } from "@/app/features/reconciliation/useReconciliationDiscrepanciesMode";
import type { ReconciliationSource } from "@/shared/types/reconciliation/reconciliation-source";

const SOURCE: ReconciliationSource = {
  id: "1",
  organization_id: "org1",
  user_id: "u1",
  document_id: null,
  source_type: "1099_k",
  tax_year: 2024,
  issuer: "Airbnb",
  reported_amount: "1000.00",
  matched_amount: "1000.00",
  discrepancy: "0.00",
  status: "matched",
  created_at: "2024-01-01T00:00:00Z",
  document_file_name: null,
  property_name: null,
};

describe("useReconciliationSourcesMode", () => {
  it("returns loading when isLoading is true", () => {
    expect(useReconciliationSourcesMode({ isLoading: true, sources: [] })).toBe("loading");
  });

  it("returns empty when sources is empty and not loading", () => {
    expect(useReconciliationSourcesMode({ isLoading: false, sources: [] })).toBe("empty");
  });

  it("returns list when sources has items", () => {
    expect(useReconciliationSourcesMode({ isLoading: false, sources: [SOURCE] })).toBe("list");
  });

  it("returns loading even when sources has items (loading takes priority)", () => {
    expect(useReconciliationSourcesMode({ isLoading: true, sources: [SOURCE] })).toBe("loading");
  });
});

describe("useReconciliationDiscrepanciesMode", () => {
  it("returns loading when isLoading is true", () => {
    expect(useReconciliationDiscrepanciesMode({ isLoading: true, count: 0 })).toBe("loading");
  });

  it("returns empty when count is 0 and not loading", () => {
    expect(useReconciliationDiscrepanciesMode({ isLoading: false, count: 0 })).toBe("empty");
  });

  it("returns list when count is positive", () => {
    expect(useReconciliationDiscrepanciesMode({ isLoading: false, count: 3 })).toBe("list");
  });

  it("returns loading even when count is positive (loading takes priority)", () => {
    expect(useReconciliationDiscrepanciesMode({ isLoading: true, count: 5 })).toBe("loading");
  });
});
