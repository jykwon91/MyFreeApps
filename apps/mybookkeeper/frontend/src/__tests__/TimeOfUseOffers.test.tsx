/**
 * Unit tests for the time-of-use plan list.
 *
 * The section exists because these plans were previously dropped before the
 * operator ever saw them. Bringing them back introduces exactly one way to make
 * things worse: presenting one as if it had been compared on price. Whether a
 * free-weekends plan beats a flat rate depends on when power is drawn, and the
 * app only knows how much — so the tests that matter here are the ones that pin
 * the *absence* of a savings claim as hard as the presence of the terms.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TimeOfUseOffers from "@/app/features/utility/TimeOfUseOffers";
import type { UtilityOffer } from "@/shared/types/utility/utility-offer";

const PROPERTY_ID = "11111111-1111-1111-1111-111111111111";

function offer(overrides: Partial<UtilityOffer> = {}): UtilityOffer {
  return {
    external_plan_id: 24545,
    provider_name: "Champion Energy",
    plan_name: "Free Weekends-24",
    term_months: 24,
    price_cents_per_kwh_at_500: "13.5",
    price_cents_per_kwh_at_1000: "12.8",
    price_cents_per_kwh_at_2000: "12.4",
    renewable_pct: 22,
    provider_rating: 5,
    jd_power_rating: null,
    cancellation_fee_cents: 15000,
    cancellation_fee_is_per_remaining_month: false,
    is_teaser_priced: false,
    annual_saving_cents: null,
    is_time_of_use: true,
    special_terms:
      "Free power from 12 midnight Friday night to 11:59 PM Sunday night. " +
      "No monthly fee or minimum usage requirement.",
    fact_sheet_url: "https://example.test/efl.pdf",
    enroll_url: "https://example.test/enroll",
    ...overrides,
  };
}

function renderSection(
  offers: UtilityOffer[],
  withheldLowRatedCount = 0,
): void {
  render(
    <TimeOfUseOffers
      offers={offers}
      withheldLowRatedCount={withheldLowRatedCount}
      propertyId={PROPERTY_ID}
    />,
  );
}

describe("TimeOfUseOffers", () => {
  it("renders nothing when the market has none and none were withheld", () => {
    const { container } = render(
      <TimeOfUseOffers
        offers={[]}
        withheldLowRatedCount={0}
        propertyId={PROPERTY_ID}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("states why no savings figure is shown", () => {
    renderSection([offer()]);
    const section = screen.getByTestId(`time-of-use-offers-${PROPERTY_ID}`);
    expect(section).toHaveTextContent(/depends on when you use power/i);
    expect(section).toHaveTextContent(/nothing here carries a savings figure/i);
  });

  it("shows the provider's own description of the free window", () => {
    renderSection([offer()]);
    expect(screen.getByTestId("time-of-use-terms-24545")).toHaveTextContent(
      "Free power from 12 midnight Friday night to 11:59 PM Sunday night.",
    );
  });

  it("says so when the provider published no description", () => {
    renderSection([offer({ special_terms: null })]);
    const terms = screen.getByTestId("time-of-use-terms-24545");
    expect(terms).toHaveTextContent(/didn't publish a description/i);
    expect(terms).toHaveTextContent(/Electricity Facts Label/i);
  });

  it("labels the blended rate as an average, never as the rate", () => {
    renderSection([offer()]);
    expect(screen.getByTestId("time-of-use-plan-24545")).toHaveTextContent(
      "12.80¢ average",
    );
  });

  it("never renders a saving, even if one somehow arrives on the offer", () => {
    // The API contract says this is always null. A regression that starts
    // populating it must not silently turn into a dollar promise on screen.
    renderSection([offer({ annual_saving_cents: 61920 })]);
    const card = screen.getByTestId("time-of-use-plan-24545");
    expect(card).not.toHaveTextContent(/\$619/);
    expect(card).not.toHaveTextContent(/save/i);
  });

  it("carries no 'best value' marker", () => {
    // These are not ranked against each other on money, so crowning one would
    // claim a comparison that was never made.
    renderSection([offer(), offer({ external_plan_id: 24638 })]);
    expect(
      screen.getByTestId(`time-of-use-offers-${PROPERTY_ID}`),
    ).not.toHaveTextContent(/best value/i);
  });

  it("shows the term, exit fee and rating", () => {
    renderSection([offer()]);
    const card = screen.getByTestId("time-of-use-plan-24545");
    expect(card).toHaveTextContent("24 months");
    expect(card).toHaveTextContent("$150");
    expect(card).toHaveTextContent("5/5");
  });

  it("renders an unrated provider as unrated, not as zero", () => {
    renderSection([offer({ provider_rating: null })]);
    expect(screen.getByTestId("time-of-use-plan-24545")).toHaveTextContent(
      "Unrated",
    );
  });

  it("opens the enrolment link safely in a new tab", () => {
    renderSection([offer()]);
    const link = screen.getByTestId("time-of-use-enroll-24545");
    expect(link).toHaveAttribute("href", "https://example.test/enroll");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
  });

  it("names how many plans were withheld for a poor rating", () => {
    renderSection([offer()], 3);
    expect(
      screen.getByTestId(`time-of-use-withheld-${PROPERTY_ID}`),
    ).toHaveTextContent("3 more plans hidden");
  });

  it("still explains itself when every plan was withheld", () => {
    // Otherwise the count appears with no heading to give it a meaning.
    renderSection([], 3);
    expect(
      screen.getByTestId(`time-of-use-offers-${PROPERTY_ID}`),
    ).toHaveTextContent(/Plans that price by time of day/i);
    expect(
      screen.getByTestId(`time-of-use-withheld-${PROPERTY_ID}`),
    ).toHaveTextContent("3 more plans hidden");
  });
});
