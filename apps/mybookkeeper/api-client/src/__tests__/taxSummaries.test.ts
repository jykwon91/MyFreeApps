import { describe, expect, it } from "vitest";
import type { SuggestionSeverity } from "../types/tax/SuggestionSeverity";
import type { SuggestionStatus } from "../types/tax/SuggestionStatus";
import type { TaxAdvisorSuggestionRead } from "../types/tax/TaxAdvisorSuggestionRead";
import type { TaxSourceDocument } from "../types/tax/TaxSourceDocument";
import type { ValidationResult } from "../types/tax/ValidationResult";
import { buildFormSummaries, summarizeForms } from "../utils/buildFormSummaries";
import { advisorCtaState, groupSuggestionsBySeverity } from "../utils/taxAdvisorView";
import { completenessLabel, completenessPercent, completenessTone } from "../utils/taxCompleteness";
import { groupTaxDocumentsByType, groupTaxDocumentsByYear } from "../utils/taxDocumentGroups";
import { formatAdvisorGeneratedAt } from "../utils/formatAdvisorGeneratedAt";
import { taxReturnYearChoices } from "../utils/taxReturnYearChoices";
import { taxFormStatus } from "../utils/taxFormStatus";
import { taxReportHeadline } from "../utils/taxReportTotals";

function doc(over: Partial<TaxSourceDocument>): TaxSourceDocument {
  return {
    document_id: "d", file_name: null, document_type: "w2", issuer_name: null, issuer_ein: null, tax_year: 2025,
    key_amount: null, source: "upload", uploaded_at: "", form_instance_id: Math.random().toString(), ...over,
  };
}

function suggestion(severity: SuggestionSeverity, status: SuggestionStatus): TaxAdvisorSuggestionRead {
  return {
    id: "s", db_id: `${severity}-${status}`, status, severity, category: "c", title: "t", description: "d", estimated_savings: null,
    action: "a", irs_reference: null, confidence: "high", affected_properties: null, affected_form: null,
    status_changed_at: null, generation_id: "g",
  };
}

describe("buildFormSummaries and taxFormStatus", () => {
  it("counts errors and warnings per form", () => {
    const results = [
      { severity: "error", form_name: "w2" },
      { severity: "warning", form_name: "w2" },
      { severity: "info", form_name: "w2" },
      { severity: "warning", form_name: "1099_k" },
    ] as ValidationResult[];
    const [w2, k] = buildFormSummaries(["w2", "1099_k", "k1"], { w2: 2 }, { w2: 9 }, results);
    expect(w2).toEqual({ form_name: "w2", instance_count: 2, field_count: 9, error_count: 1, warning_count: 1 });
    expect(k.warning_count).toBe(1);
    expect(taxFormStatus(2, 1)).toEqual({ tone: "error", label: "2 errors" });
    expect(taxFormStatus(1, 1).label).toBe("1 error");
    expect(taxFormStatus(0, 3)).toEqual({ tone: "warning", label: "3 warnings" });
    expect(taxFormStatus(0, 0)).toEqual({ tone: "valid", label: "Valid" });
  });
});

describe("completeness", () => {
  it("rounds, labels and tones", () => {
    expect(completenessPercent({ total_filled: 1, total_expected: 3 })).toBe(33);
    expect(completenessPercent({ total_filled: 0, total_expected: 0 })).toBe(0);
    expect([100, 80, 50, 10].map(completenessLabel)).toEqual(["Complete", "Almost there", "In progress", "Needs attention"]);
    expect([100, 60, 10].map(completenessTone)).toEqual(["complete", "partial", "low"]);
  });
});

describe("tax document groups", () => {
  it("groups by type in tax-form order, keeping arrival order", () => {
    const groups = groupTaxDocumentsByType([doc({ document_type: "1099_k", issuer_name: "B" }), doc({ document_type: "w2", issuer_name: "Z" }), doc({ document_type: "w2", issuer_name: "A" })]);
    expect(groups.map((g) => g.type)).toEqual(["w2", "1099_k"]);
    expect(groups[0].docs.map((d) => d.issuer_name)).toEqual(["Z", "A"]);
  });
  it("groups by year newest first and sorts issuers", () => {
    const groups = groupTaxDocumentsByYear([doc({ tax_year: 2024, issuer_name: "x" }), doc({ tax_year: 2025, issuer_name: "b" }), doc({ tax_year: 2025, issuer_name: "a" })]);
    expect(groups.map((g) => g.year)).toEqual([2025, 2024]);
    expect(groups[0].types[0].docs.map((d) => d.issuer_name)).toEqual(["a", "b"]);
  });
});

describe("advisor view", () => {
  it("hides dismissed suggestions and orders by severity", () => {
    const groups = groupSuggestionsBySeverity([suggestion("low", "active"), suggestion("high", "resolved"), suggestion("high", "dismissed")]);
    expect(groups.map((g) => [g.severity, g.items.length])).toEqual([["high", 1], ["low", 1]]);
  });
  it("tells a rate limit from another failure", () => {
    expect(advisorCtaState({ status: 429 })).toBe("rate-limited");
    expect(advisorCtaState({ status: 403 })).toBe("demo");
    expect(advisorCtaState({ status: 500 })).toBe("error");
    expect(advisorCtaState(undefined)).toBe("idle");
  });
});

describe("taxReportHeadline", () => {
  it("uses total income less deductions when there are wages", () => {
    expect(taxReportHeadline({ w2_total: 100, total_income: 500, total_deductions: 120, net_taxable_income: 7 })).toEqual({ label: "Total Income", amount: 380 });
    expect(taxReportHeadline({ w2_total: 0, total_income: 500, total_deductions: 120, net_taxable_income: 7 })).toEqual({ label: "Net Taxable Income", amount: 7 });
  });
});

describe("summarizeForms", () => {
  it("lists forms with data and forms that only have a check, counting the checks", () => {
    const result = summarizeForms(
      [{ form_name: "w2", instance_count: 2, field_count: 9 }],
      [
        { severity: "error", form_name: "w2", field_id: null, message: "m", expected_value: null, actual_value: null },
        { severity: "warning", form_name: "1099_int", field_id: null, message: "m", expected_value: null, actual_value: null },
      ],
    );
    expect(result).toEqual([
      { form_name: "w2", instance_count: 2, field_count: 9, error_count: 1, warning_count: 0 },
      { form_name: "1099_int", instance_count: 0, field_count: 0, error_count: 0, warning_count: 1 },
    ]);
  });
});

describe("formatAdvisorGeneratedAt", () => {
  it("includes the time of day", () => {
    expect(formatAdvisorGeneratedAt("2026-03-10T14:05:00")).toBe("Mar 10, 2026 at 2:05 PM");
  });
});

describe("taxReturnYearChoices", () => {
  it("offers the whole range the server accepts, newest first", () => {
    const years = taxReturnYearChoices();
    expect(years[0]).toBe(2099);
    expect(years[years.length - 1]).toBe(2020);
    expect(years).toHaveLength(80);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });
});
