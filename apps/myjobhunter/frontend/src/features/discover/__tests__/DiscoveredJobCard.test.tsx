/**
 * Tests for DiscoveredJobCard — verdict badge, promoted state, and
 * "View application" link introduced in PR 7.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DiscoveredJobCard from "../DiscoveredJobCard";
import type { DiscoveredJob } from "@/types/discovery/discovered-job";

vi.mock("lucide-react", () => ({
  Bookmark: () => null,
  Briefcase: () => null,
  Check: () => null,
  ExternalLink: () => null,
  Loader2: () => null,
  X: () => null,
}));

vi.mock("@platform/ui", () => ({
  Badge: ({ label }: { label: string }) => <span data-testid="badge">{label}</span>,
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  formatSalaryRange: () => "—",
  showError: vi.fn(),
  showSuccess: vi.fn(),
  timeAgo: () => "2 hours ago",
  extractErrorMessage: vi.fn(),
}));

vi.mock("@/store/discoverApi", () => ({
  useDismissDiscoveredJobMutation: () => [vi.fn(), { isLoading: false }],
  useSaveDiscoveredJobMutation: () => [vi.fn(), { isLoading: false }],
  usePromoteDiscoveredJobMutation: () => [vi.fn(), { isLoading: false }],
  // Added in PR 8 (undo-dismiss toast). No-op here — toast rendering is
  // tested separately in UndoDismissToast.test.tsx.
  useUndoDismissDiscoveredJobMutation: () => [vi.fn(), { isLoading: false }],
}));

function renderInRouter(ui: React.ReactElement) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<MemoryRouter>{ui as any}</MemoryRouter>);
}

function makeJob(overrides: Partial<DiscoveredJob> = {}): DiscoveredJob {
  return {
    id: "job-1",
    source: "jsearch",
    source_publisher: null,
    source_url: null,
    title: "Senior Backend Engineer",
    company_name: "Acme Corp",
    location: "Remote",
    remote_type: "remote",
    description: null,
    posted_at: null,
    discovered_at: "2026-05-08T10:00:00Z",
    salary_min: null,
    salary_max: null,
    salary_currency: "USD",
    salary_period: null,
    score: null,
    score_reason: null,
    scored_at: null,
    dismissed_at: null,
    dismissed_reason: null,
    saved_at: null,
    promoted_application_id: null,
    verdict: null,
    ...overrides,
  };
}

describe("DiscoveredJobCard — verdict badge", () => {
  it("shows no verdict badge when verdict is null (unscored)", () => {
    renderInRouter(<DiscoveredJobCard job={makeJob({ verdict: null })} />);
    expect(screen.queryByTestId("badge")).toBeNull();
  });

  it("shows 'Strong fit' badge for strong_fit verdict", () => {
    renderInRouter(<DiscoveredJobCard job={makeJob({ verdict: "strong_fit", score: 90 })} />);
    expect(screen.getByTestId("badge")).toHaveTextContent("Strong fit");
  });

  it("shows 'Worth considering' badge for worth_considering verdict", () => {
    renderInRouter(<DiscoveredJobCard job={makeJob({ verdict: "worth_considering", score: 70 })} />);
    expect(screen.getByTestId("badge")).toHaveTextContent("Worth considering");
  });

  it("shows 'Stretch' badge for stretch verdict", () => {
    renderInRouter(<DiscoveredJobCard job={makeJob({ verdict: "stretch", score: 40 })} />);
    expect(screen.getByTestId("badge")).toHaveTextContent("Stretch");
  });

  it("shows 'Mismatch' badge for mismatch verdict", () => {
    renderInRouter(<DiscoveredJobCard job={makeJob({ verdict: "mismatch", score: 15 })} />);
    expect(screen.getByTestId("badge")).toHaveTextContent("Mismatch");
  });

  it("renders the job title and company name", () => {
    renderInRouter(<DiscoveredJobCard job={makeJob()} />);
    expect(screen.getByText("Senior Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
  });
});

describe("DiscoveredJobCard — unscored visual signal (PR 4b)", () => {
  it("shows 'Awaiting AI score' pill when unscored and polling is idle", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({ verdict: null, score: null })}
        isScoringInFlight={false}
      />,
    );
    expect(
      screen.getByTestId("discovered-job-awaiting-score"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("discovered-job-scoring-spinner"),
    ).toBeNull();
  });

  it("shows a spinner when unscored and polling is in flight", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({ verdict: null, score: null })}
        isScoringInFlight={true}
      />,
    );
    expect(
      screen.getByTestId("discovered-job-scoring-spinner"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("discovered-job-awaiting-score"),
    ).toBeNull();
  });

  it("shows neither pill nor spinner when the job already has a verdict", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({ verdict: "strong_fit", score: 90 })}
        isScoringInFlight={true}
      />,
    );
    expect(
      screen.queryByTestId("discovered-job-awaiting-score"),
    ).toBeNull();
    expect(
      screen.queryByTestId("discovered-job-scoring-spinner"),
    ).toBeNull();
  });

  it("defaults isScoringInFlight to false when omitted", () => {
    renderInRouter(<DiscoveredJobCard job={makeJob({ verdict: null, score: null })} />);
    // Default falsy → static pill, not the spinner.
    expect(
      screen.getByTestId("discovered-job-awaiting-score"),
    ).toBeInTheDocument();
  });
});

describe("DiscoveredJobCard — post-promote view application link (PR 7)", () => {
  it("shows 'Applied' badge when job is promoted", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({ promoted_application_id: "app-abc-123" })}
      />,
    );
    expect(screen.getByTestId("promoted-applied-badge")).toBeInTheDocument();
    expect(screen.getByTestId("promoted-applied-badge")).toHaveTextContent("Applied");
  });

  it("shows 'View application' link pointing to the application detail page", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({ promoted_application_id: "app-abc-123" })}
      />,
    );
    const link = screen.getByTestId("view-application-link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/applications/app-abc-123");
  });

  it("does not show 'View application' link when not promoted", () => {
    renderInRouter(
      <DiscoveredJobCard job={makeJob({ promoted_application_id: null })} />,
    );
    expect(screen.queryByTestId("view-application-link")).toBeNull();
    expect(screen.queryByTestId("promoted-applied-badge")).toBeNull();
  });
});
