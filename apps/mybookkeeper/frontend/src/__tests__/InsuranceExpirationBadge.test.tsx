/**
 * Unit tests for InsuranceExpirationBadge.
 *
 * Verifies all badge states:
 * - null expirationDate → nothing rendered
 * - Past date → red "Expired" badge
 * - Within 30 days → orange "Expires in N days" badge
 * - Within 90 days → yellow "Expires in N days" badge
 * - Beyond 90 days → nothing rendered
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import InsuranceExpirationBadge from "@/app/features/insurance/InsuranceExpirationBadge";

/**
 * Return an ISO date string N days from today (negative for past).
 * We pin "today" so tests are stable regardless of when they run.
 */
function isoDateDaysFromNow(days: number): string {
  const d = new Date(2026, 4, 3); // 2026-05-03 (pinned)
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// Pin Date.now so differenceInDays is deterministic.
const PINNED_NOW = new Date(2026, 4, 3).getTime(); // 2026-05-03 00:00:00 local

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(PINNED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("InsuranceExpirationBadge — null / no expiry", () => {
  it("renders nothing when expirationDate is null", () => {
    const { container } = render(<InsuranceExpirationBadge expirationDate={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("InsuranceExpirationBadge — expired", () => {
  it("shows 'Expired' badge for a date in the past", () => {
    render(<InsuranceExpirationBadge expirationDate={isoDateDaysFromNow(-1)} />);
    expect(screen.getByTestId("expiration-badge-expired")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("shows 'Expired' badge for a date 30 days in the past", () => {
    render(<InsuranceExpirationBadge expirationDate={isoDateDaysFromNow(-30)} />);
    expect(screen.getByTestId("expiration-badge-expired")).toBeInTheDocument();
  });

  it("'Expired' badge has destructive colour class", () => {
    render(<InsuranceExpirationBadge expirationDate={isoDateDaysFromNow(-1)} />);
    const badge = screen.getByTestId("expiration-badge-expired");
    expect(badge.className).toMatch(/bg-destructive/);
    expect(badge.className).toMatch(/text-destructive/);
  });
});

describe("InsuranceExpirationBadge — soon (≤30 days)", () => {
  it("shows 'Expires in N days' badge for a date exactly 30 days away", () => {
    render(<InsuranceExpirationBadge expirationDate={isoDateDaysFromNow(30)} />);
    expect(screen.getByTestId("expiration-badge-soon")).toBeInTheDocument();
    expect(screen.getByText(/Expires in 30 days/)).toBeInTheDocument();
  });

  it("shows 'Expires in N days' badge for a date 15 days away", () => {
    render(<InsuranceExpirationBadge expirationDate={isoDateDaysFromNow(15)} />);
    expect(screen.getByTestId("expiration-badge-soon")).toBeInTheDocument();
    expect(screen.getByText(/Expires in 15 days/)).toBeInTheDocument();
  });

  it("says 'tomorrow' when exactly 1 day away, as the phone does", () => {
    render(<InsuranceExpirationBadge expirationDate={isoDateDaysFromNow(1)} />);
    expect(screen.getByTestId("expiration-badge-soon")).toBeInTheDocument();
    expect(screen.getByText("Expires tomorrow")).toBeInTheDocument();
  });

  it("says 'today' on the expiry date", () => {
    render(<InsuranceExpirationBadge expirationDate={isoDateDaysFromNow(0)} />);
    expect(screen.getByTestId("expiration-badge-soon")).toBeInTheDocument();
    expect(screen.getByText("Expires today")).toBeInTheDocument();
  });

  it("'soon' badge has orange colour classes", () => {
    render(<InsuranceExpirationBadge expirationDate={isoDateDaysFromNow(15)} />);
    const badge = screen.getByTestId("expiration-badge-soon");
    expect(badge.className).toMatch(/bg-orange-100/);
    expect(badge.className).toMatch(/text-orange-700/);
  });
});

describe("InsuranceExpirationBadge — upcoming (31–90 days)", () => {
  it("shows 'Expires in N days' badge for a date 31 days away", () => {
    render(<InsuranceExpirationBadge expirationDate={isoDateDaysFromNow(31)} />);
    expect(screen.getByTestId("expiration-badge-upcoming")).toBeInTheDocument();
    expect(screen.getByText(/Expires in 31 days/)).toBeInTheDocument();
  });

  it("shows 'Expires in N days' badge for a date exactly 90 days away", () => {
    render(<InsuranceExpirationBadge expirationDate={isoDateDaysFromNow(90)} />);
    expect(screen.getByTestId("expiration-badge-upcoming")).toBeInTheDocument();
    expect(screen.getByText(/Expires in 90 days/)).toBeInTheDocument();
  });

  it("'upcoming' badge has yellow colour classes", () => {
    render(<InsuranceExpirationBadge expirationDate={isoDateDaysFromNow(60)} />);
    const badge = screen.getByTestId("expiration-badge-upcoming");
    expect(badge.className).toMatch(/bg-yellow-100/);
    expect(badge.className).toMatch(/text-yellow-700/);
  });
});

describe("InsuranceExpirationBadge — far future (>90 days)", () => {
  it("renders nothing for a date 91 days away", () => {
    const { container } = render(
      <InsuranceExpirationBadge expirationDate={isoDateDaysFromNow(91)} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a date 365 days away", () => {
    const { container } = render(
      <InsuranceExpirationBadge expirationDate={isoDateDaysFromNow(365)} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("InsuranceExpirationBadge — counts calendar days late in the day", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 10, 14, 20, 0)); // Nov 14, 8pm local
  });

  it("counts 2 days from 8pm Nov 14 to Nov 16", () => {
    render(<InsuranceExpirationBadge expirationDate="2026-11-16" />);
    expect(screen.getByText("Expires in 2 days")).toBeInTheDocument();
  });

  it("says tomorrow from 8pm Nov 14 to Nov 15", () => {
    render(<InsuranceExpirationBadge expirationDate="2026-11-15" />);
    expect(screen.getByText("Expires tomorrow")).toBeInTheDocument();
  });

  it("still shows the amber badge on the 30th calendar day", () => {
    render(<InsuranceExpirationBadge expirationDate="2026-12-14" />);
    expect(screen.getByTestId("expiration-badge-soon")).toBeInTheDocument();
  });

  it("still shows the yellow badge on the 90th calendar day", () => {
    render(<InsuranceExpirationBadge expirationDate="2027-02-12" />);
    expect(screen.getByTestId("expiration-badge-upcoming")).toBeInTheDocument();
  });

  it("is not expired on its expiry date", () => {
    vi.setSystemTime(new Date(2026, 10, 16, 20, 0));
    render(<InsuranceExpirationBadge expirationDate="2026-11-16" />);
    expect(screen.getByText("Expires today")).toBeInTheDocument();
  });
});
