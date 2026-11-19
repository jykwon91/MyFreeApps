/**
 * Against the real RTK Query hooks: the Mortgages, Utility Plans and Insurance pages reach rows past the
 * first page with Load more, instead of stopping at what the server hands back in one request.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Mortgages from "@/app/pages/Mortgages";
import UtilityPlans from "@/app/pages/UtilityPlans";
import InsurancePolicies from "@/app/pages/InsurancePolicies";
import { MORTGAGE_PAGE_SIZE } from "@mybookkeeper/api-client/constants/mortgagePaging";
import { UTILITY_PLAN_PAGE_SIZE } from "@mybookkeeper/api-client/constants/utilityPlanPaging";
import { INSURANCE_POLICY_PAGE_SIZE } from "@mybookkeeper/api-client/constants/insurancePolicyPaging";
import type { Mortgage } from "@mybookkeeper/api-client/types/mortgage/mortgage";
import type { UtilityPlanSummary } from "@mybookkeeper/api-client/types/utility/utility-plan-summary";
import type { InsurancePolicySummary } from "@mybookkeeper/api-client/types/insurance/insurance-policy-summary";
import { restoreApi, stubApi } from "@/test/api-stub";
import { renderWithStore } from "@/test/render-with-store";
import { answerListPage } from "@/test/paged-list-server";

// The market panels around each list read other endpoints; this file is about the list.
vi.mock("@/app/features/mortgages/MortgageRateWatchSection", () => ({ default: () => null }));
vi.mock("@/app/features/utility/MarketRateBenchmarkSummary", () => ({ default: () => null }));
vi.mock("@/app/features/utility/BetterPlansSection", () => ({ default: () => null }));
vi.mock("@/app/features/insurance/InsuranceBenchmarkSummary", () => ({ default: () => null }));
vi.mock("@/app/features/insurance/RateWatchSection", () => ({ default: () => null }));

function mortgage(n: number): Mortgage {
  return {
    id: `mtg-${n}`,
    user_id: "u1",
    organization_id: "org-1",
    property_id: `prop-${n}`,
    property_name: `Loan house ${n}`,
    source_document_id: null,
    lender: null,
    account_number: null,
    current_balance_cents: null,
    statement_date: null,
    original_principal_cents: null,
    interest_rate: "6.500",
    rate_type: "fixed",
    fixed_until: null,
    maturity_date: null,
    term_months: null,
    monthly_principal_cents: null,
    monthly_interest_cents: null,
    monthly_escrow_cents: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function plan(n: number): UtilityPlanSummary {
  return {
    id: `plan-${n}`,
    property_id: `prop-${n}`,
    property_name: `Plan house ${n}`,
    service_type: "electricity",
    provider_name: `Provider ${n}`,
    plan_name: null,
    rate_type: "fixed",
    avg_price_cents_per_kwh_at_1000: null,
    term_end_date: null,
    days_until_term_end: null,
    renewal_status: "not_applicable",
    is_current: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function policy(n: number): InsurancePolicySummary {
  return {
    id: `pol-${n}`,
    property_id: `prop-${n}`,
    property_name: `Policy house ${n}`,
    policy_name: `Policy ${n}`,
    carrier: null,
    effective_date: null,
    expiration_date: null,
    coverage_amount_cents: null,
    premium_cents: null,
    premium_frequency: null,
    fees_and_taxes_cents: null,
    deductible_cents: null,
    wind_hail_deductible_pct: null,
    annual_premium_cents: null,
    annual_total_cents: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

/** One row more than a page, so the last one is only reachable through Load more. */
function rowsPastOnePage<T>(pageSize: number, make: (n: number) => T): T[] {
  return Array.from({ length: pageSize + 1 }, (_, i) => make(i + 1));
}

/** Serves `rows` at `path` a page at a time, the way the server does. Returns every request's params. */
function serveList<T>(path: string, rows: readonly T[]): Record<string, unknown>[] {
  const requests: Record<string, unknown>[] = [];
  stubApi((requested, params) => {
    if (requested !== path) return [];
    requests.push(params);
    return answerListPage(rows, params);
  });
  return requests;
}

let cleanup: () => void = () => undefined;

afterEach(() => {
  cleanup();
  restoreApi();
});

describe("finance lists reach past the first page", () => {
  it("Mortgages loads the next page on Load more", async () => {
    const requests = serveList("/mortgages", rowsPastOnePage(MORTGAGE_PAGE_SIZE, mortgage));
    cleanup = renderWithStore(<Mortgages />, "/mortgages");

    expect(await screen.findByText(`Loan house ${MORTGAGE_PAGE_SIZE}`)).toBeInTheDocument();
    expect(screen.queryByText(`Loan house ${MORTGAGE_PAGE_SIZE + 1}`)).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("load-more-button"));

    expect(await screen.findByText(`Loan house ${MORTGAGE_PAGE_SIZE + 1}`)).toBeInTheDocument();
    expect(screen.getByText("Loan house 1")).toBeInTheDocument();
    expect(screen.queryByTestId("load-more-button")).not.toBeInTheDocument();
    expect(requests.map((params) => params.offset)).toEqual([0, MORTGAGE_PAGE_SIZE]);
  });

  it("Utility Plans loads the next page on Load more", async () => {
    const requests = serveList("/utility-plans", rowsPastOnePage(UTILITY_PLAN_PAGE_SIZE, plan));
    cleanup = renderWithStore(<UtilityPlans />, "/utility-plans");

    expect(await screen.findByTestId(`utility-plan-item-plan-${UTILITY_PLAN_PAGE_SIZE}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`utility-plan-item-plan-${UTILITY_PLAN_PAGE_SIZE + 1}`)).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("load-more-button"));

    expect(await screen.findByTestId(`utility-plan-item-plan-${UTILITY_PLAN_PAGE_SIZE + 1}`)).toBeInTheDocument();
    expect(requests.map((params) => params.offset)).toEqual([0, UTILITY_PLAN_PAGE_SIZE]);
  });

  it("Utility Plans asks the server for the plans that need renewing, from the first page", async () => {
    const requests = serveList("/utility-plans", [plan(1)]);
    cleanup = renderWithStore(<UtilityPlans />, "/utility-plans");
    await screen.findByTestId("utility-plan-item-plan-1");

    await userEvent.click(screen.getByTestId("utility-plans-expiring-toggle"));

    await screen.findByTestId("utility-plan-item-plan-1");
    expect(requests[requests.length - 1]).toMatchObject({ needs_renewal: true, offset: 0 });
  });

  it("Insurance loads the next page on Load more", async () => {
    const requests = serveList("/insurance-policies", rowsPastOnePage(INSURANCE_POLICY_PAGE_SIZE, policy));
    cleanup = renderWithStore(<InsurancePolicies />, "/insurance-policies");

    expect(await screen.findByText(`Policy ${INSURANCE_POLICY_PAGE_SIZE}`)).toBeInTheDocument();
    expect(screen.queryByText(`Policy ${INSURANCE_POLICY_PAGE_SIZE + 1}`)).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("load-more-button"));

    expect(await screen.findByText(`Policy ${INSURANCE_POLICY_PAGE_SIZE + 1}`)).toBeInTheDocument();
    expect(requests.map((params) => params.offset)).toEqual([0, INSURANCE_POLICY_PAGE_SIZE]);
  });
});
