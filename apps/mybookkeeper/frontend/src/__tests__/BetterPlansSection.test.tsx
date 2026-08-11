/**
 * Unit tests for the "Find a better plan" section.
 *
 * Two behaviours matter most and both are about honesty of the list:
 *
 * 1. Offers withheld for a poor provider rating are *named*. A silently shorter
 *    list reads as "this is the whole market", and the operator has twice said
 *    they do not want the cheapest plan from a 1-star REP — so the gate must be
 *    visible, not just applied.
 * 2. A teaser-priced offer is labelled. Its headline rate is genuinely the
 *    lowest number on screen, and without the caveat that is what gets picked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import BetterPlansSection from "@/app/features/utility/BetterPlansSection";
import type { UtilityOffer } from "@/shared/types/utility/utility-offer";
import type { UtilityOfferGroup } from "@/shared/types/utility/utility-offer-group";
import type { UtilityOfferSearchResponse } from "@/shared/types/utility/utility-offer-search-response";

const mockSearch = vi.fn();
let mockData: UtilityOfferSearchResponse | undefined;
let mockFetching = false;
let mockError = false;
let mockUninitialized = true;

vi.mock("@/shared/store/utilityOffersApi", () => ({
  useLazyFindBetterUtilityPlansQuery: () => [
    mockSearch,
    {
      data: mockData,
      isFetching: mockFetching,
      isError: mockError,
      isUninitialized: mockUninitialized,
    },
  ],
}));

function offer(overrides: Partial<UtilityOffer> = {}): UtilityOffer {
  return {
    external_plan_id: 1,
    provider_name: "Veteran Energy",
    plan_name: "Basic 12",
    term_months: 12,
    price_cents_per_kwh_at_500: "11.0",
    price_cents_per_kwh_at_1000: "10.5",
    price_cents_per_kwh_at_2000: "10.3",
    renewable_pct: null,
    provider_rating: 3,
    jd_power_rating: null,
    cancellation_fee_cents: 15000,
    cancellation_fee_is_per_remaining_month: false,
    is_teaser_priced: false,
    annual_saving_cents: 61920,
    fact_sheet_url: "https://example.test/efl.pdf",
    enroll_url: "https://example.test/enroll",
    ...overrides,
  };
}

function group(overrides: Partial<UtilityOfferGroup> = {}): UtilityOfferGroup {
  return {
    property_id: "11111111-1111-1111-1111-111111111111",
    property_name: "6734 Peerless",
    zip_code: "77021",
    current_provider_name: "Constellation",
    current_price_cents_per_kwh_at_1000: "15.66",
    switch_cost_cents: 15000,
    offers: [offer()],
    withheld_low_rated_count: 0,
    unavailable_reason: null,
    ...overrides,
  };
}

function renderSection() {
  return render(
    <Provider store={store}>
      <BetterPlansSection />
    </Provider>,
  );
}

beforeEach(() => {
  mockSearch.mockClear();
  mockData = undefined;
  mockFetching = false;
  mockError = false;
  mockUninitialized = true;
});

describe("BetterPlansSection", () => {
  it("does not hit the feed until asked", () => {
    renderSection();
    expect(screen.getByTestId("better-plans-idle")).toBeInTheDocument();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("runs the search when the button is clicked", async () => {
    renderSection();
    await userEvent.click(screen.getByTestId("find-better-plans-button"));
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it("shows a skeleton while the feed is being read", () => {
    mockFetching = true;
    renderSection();
    expect(screen.getByTestId("better-plans-loading")).toBeInTheDocument();
  });

  it("names how many cheaper offers were withheld for a poor rating", () => {
    mockUninitialized = false;
    mockData = {
      groups: [group({ withheld_low_rated_count: 33 })],
      reference_annual_kwh: 12000,
      has_any_offers: true,
    };
    renderSection();

    const withheld = screen.getByTestId(
      "better-plans-withheld-11111111-1111-1111-1111-111111111111",
    );
    expect(withheld).toHaveTextContent("33 cheaper offers hidden");
    expect(withheld).toHaveTextContent("poorly rated or unrated");
  });

  it("labels a teaser-priced offer", () => {
    mockUninitialized = false;
    mockData = {
      groups: [
        group({
          offers: [
            offer({
              external_plan_id: 99,
              provider_name: "AP Gas",
              price_cents_per_kwh_at_500: "19.2",
              price_cents_per_kwh_at_1000: "6.2",
              price_cents_per_kwh_at_2000: "12.2",
              is_teaser_priced: true,
            }),
          ],
        }),
      ],
      reference_annual_kwh: 12000,
      has_any_offers: true,
    };
    renderSection();

    expect(screen.getByTestId("better-plan-teaser-99")).toHaveTextContent(
      "only holds near 1,000 kWh",
    );
  });

  it("states an offer as a movement against the plan the property holds", () => {
    mockUninitialized = false;
    mockData = {
      groups: [group()],
      reference_annual_kwh: 12000,
      has_any_offers: true,
    };
    renderSection();

    const card = screen.getByTestId("better-plan-1");
    // The headline answer, then the two stats that move: 15.66¢ → 10.50¢, and
    // $1,879 → $1,260 a year at the disclosure usage.
    expect(card).toHaveTextContent("$619");
    expect(card).toHaveTextContent("less per year than now");
    expect(card).toHaveTextContent("5.16¢ less");
    expect(card).toHaveTextContent("$619 less");
    expect(card).toHaveTextContent("3/5");
  });

  it("shows what the property is on today, as the thing being compared to", () => {
    mockUninitialized = false;
    mockData = {
      groups: [group()],
      reference_annual_kwh: 12000,
      has_any_offers: true,
    };
    renderSection();

    const equipped = screen.getByTestId(
      "equipped-plan-11111111-1111-1111-1111-111111111111",
    );
    expect(equipped).toHaveTextContent("Constellation");
    expect(equipped).toHaveTextContent("15.66¢/kWh");
    expect(equipped).toHaveTextContent("$1,879");
    expect(equipped).toHaveTextContent("$150");
  });

  it("names the exit-fee gap instead of implying leaving is free", () => {
    mockUninitialized = false;
    mockData = {
      groups: [group({ switch_cost_cents: null })],
      reference_annual_kwh: 12000,
      has_any_offers: true,
    };
    renderSection();

    const equipped = screen.getByTestId(
      "equipped-plan-11111111-1111-1111-1111-111111111111",
    );
    expect(equipped).toHaveTextContent("Not recorded");
    expect(
      screen.getByTestId(
        "equipped-plan-no-exit-fee-11111111-1111-1111-1111-111111111111",
      ),
    ).toHaveTextContent("early termination fee");
  });

  it("collapses identical offers into one choice led by the cheapest to leave", () => {
    mockUninitialized = false;
    mockData = {
      groups: [
        group({
          offers: [
            offer({ external_plan_id: 1, provider_name: "Energy Texas" }),
            offer({
              external_plan_id: 2,
              provider_name: "Octopus Energy",
              cancellation_fee_cents: 2000,
              cancellation_fee_is_per_remaining_month: true,
            }),
          ],
        }),
      ],
      reference_annual_kwh: 12000,
      has_any_offers: true,
    };
    renderSection();

    // Same rate, term and rating — one decision. Energy Texas leads on a flat
    // $150 exit fee; Octopus's $20-per-remaining-month is $240 over 12 months.
    expect(screen.getByTestId("better-plan-1")).toBeInTheDocument();
    expect(screen.queryByTestId("better-plan-2")).not.toBeInTheDocument();
    expect(screen.getByTestId("tier-alternate-2")).toHaveTextContent(
      "Octopus Energy",
    );
  });

  it("says why a property has nothing to show instead of showing nothing", () => {
    mockUninitialized = false;
    mockData = {
      groups: [
        group({
          offers: [],
          zip_code: null,
          unavailable_reason: "Add a ZIP code to this property's address.",
        }),
      ],
      reference_annual_kwh: 12000,
      has_any_offers: false,
    };
    renderSection();

    expect(
      screen.getByTestId(
        "better-plans-unavailable-11111111-1111-1111-1111-111111111111",
      ),
    ).toHaveTextContent("Add a ZIP code");
  });

  it("distinguishes a feed outage from a bad rate", () => {
    mockUninitialized = false;
    mockError = true;
    renderSection();
    expect(screen.getByTestId("better-plans-error")).toHaveTextContent(
      "Nothing is wrong with your plans",
    );
  });

  it("labels the usage basis so a saving is not read as a bill promise", () => {
    mockUninitialized = false;
    mockData = {
      groups: [group()],
      reference_annual_kwh: 12000,
      has_any_offers: true,
    };
    renderSection();
    expect(screen.getByTestId("better-plans-results")).toHaveTextContent(
      "12,000 kWh per year",
    );
  });
});
