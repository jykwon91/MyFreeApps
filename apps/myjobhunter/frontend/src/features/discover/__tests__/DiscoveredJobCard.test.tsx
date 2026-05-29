/**
 * Tests for DiscoveredJobCard — verdict badge, promoted state, source badge,
 * and "View application" link introduced in PR 7.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DiscoveredJobCard from "../DiscoveredJobCard";
import type { DiscoveredJob } from "@/types/discovery/discovered-job";
import type { DiscoverySource } from "@/types/discovery/discovery-source";

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
    discovery_source_id: null,
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
  it("shows the static 'Not scored' pill when unscored and the scoring window is closed", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({ verdict: null, score: null })}
        isScoringInFlight={false}
      />,
    );
    const pill = screen.getByTestId("discovered-job-awaiting-score");
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent("Not scored");
    // Regression: a score===null card in the steady state must NOT animate.
    // The perpetual "Scoring" spinner was the bug — the static pill is a
    // real terminal state, not a spinner that never resolves.
    expect(
      screen.queryByTestId("discovered-job-scoring-spinner"),
    ).toBeNull();
  });

  it("shows a spinner when unscored and the scoring window is open", () => {
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

  it("defaults isScoringInFlight to false when omitted (static pill, no spinner)", () => {
    renderInRouter(<DiscoveredJobCard job={makeJob({ verdict: null, score: null })} />);
    // Default falsy → static pill, not the spinner.
    expect(
      screen.getByTestId("discovered-job-awaiting-score"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("discovered-job-scoring-spinner"),
    ).toBeNull();
  });
});

describe("DiscoveredJobCard — score-staleness pill (score-staleness-signal PR)", () => {
  // A scored job with a profile-updated-at that is NEWER than scored_at
  // → the score is stale, the "Re-scoring soon" pill should appear.
  it("shows 'Re-scoring soon' pill when scored_at is older than profileUpdatedAt", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({
          verdict: "strong_fit",
          score: 90,
          scored_at: "2026-05-08T10:00:00Z",
        })}
        profileUpdatedAt="2026-05-09T12:00:00Z"
      />,
    );
    expect(
      screen.getByTestId("discovered-job-score-stale"),
    ).toBeInTheDocument();
  });

  it("does NOT show the staleness pill when scored_at is newer than profileUpdatedAt", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({
          verdict: "strong_fit",
          score: 90,
          scored_at: "2026-05-10T10:00:00Z",
        })}
        profileUpdatedAt="2026-05-09T12:00:00Z"
      />,
    );
    expect(
      screen.queryByTestId("discovered-job-score-stale"),
    ).toBeNull();
  });

  it("does NOT show the staleness pill when profileUpdatedAt is null", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({
          verdict: "strong_fit",
          score: 90,
          scored_at: "2026-05-08T10:00:00Z",
        })}
        profileUpdatedAt={null}
      />,
    );
    expect(
      screen.queryByTestId("discovered-job-score-stale"),
    ).toBeNull();
  });

  it("does NOT show the staleness pill when profileUpdatedAt is omitted (default)", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({
          verdict: "strong_fit",
          score: 90,
          scored_at: "2026-05-08T10:00:00Z",
        })}
      />,
    );
    expect(
      screen.queryByTestId("discovered-job-score-stale"),
    ).toBeNull();
  });

  it("does NOT show the staleness pill for a truly unscored card (score=null) even if profile is newer", () => {
    // An unscored card already shows "Awaiting AI score". The staleness pill
    // is only meaningful when there IS an existing score to call stale.
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({ verdict: null, score: null, scored_at: null })}
        profileUpdatedAt="2026-05-09T12:00:00Z"
      />,
    );
    expect(
      screen.queryByTestId("discovered-job-score-stale"),
    ).toBeNull();
    // The regular "Awaiting AI score" pill should still be there.
    expect(
      screen.getByTestId("discovered-job-awaiting-score"),
    ).toBeInTheDocument();
  });

  it("shows both the verdict badge AND the staleness pill for a stale scored card", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({
          verdict: "worth_considering",
          score: 70,
          scored_at: "2026-05-08T10:00:00Z",
        })}
        profileUpdatedAt="2026-05-09T12:00:00Z"
      />,
    );
    // Verdict badge rendered (via the mocked Badge)
    expect(screen.getByTestId("badge")).toHaveTextContent("Worth considering");
    // Staleness pill also rendered
    expect(screen.getByTestId("discovered-job-score-stale")).toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// Source-name badge (filter chips feature)
// ---------------------------------------------------------------------------

function makeSource(overrides: Partial<DiscoverySource> = {}): DiscoverySource {
  return {
    id: "src-1",
    source: "jsearch",
    name: "Python remote",
    config: {},
    is_active: true,
    fetch_interval_minutes: 1440,
    last_fetched_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error_message: null,
    consecutive_failures: 0,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

describe("DiscoveredJobCard — source-name badge", () => {
  it("shows no source badge when discovery_source_id is null", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({ discovery_source_id: null })}
        sources={[makeSource()]}
      />,
    );
    expect(screen.queryByTestId("source-name-badge")).toBeNull();
  });

  it("shows no source badge when sources list is empty (default)", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({ discovery_source_id: "src-1" })}
      />,
    );
    expect(screen.queryByTestId("source-name-badge")).toBeNull();
  });

  it("shows the source name badge when discovery_source_id matches a source", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({ discovery_source_id: "src-1" })}
        sources={[makeSource({ id: "src-1", name: "Python remote" })]}
      />,
    );
    const badge = screen.getByTestId("source-name-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Python remote");
  });

  it("falls back to source.source when source name is empty", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({ discovery_source_id: "src-1" })}
        sources={[makeSource({ id: "src-1", name: "", source: "jsearch" })]}
      />,
    );
    expect(screen.getByTestId("source-name-badge")).toHaveTextContent("jsearch");
  });

  it("shows no badge when discovery_source_id does not match any source", () => {
    renderInRouter(
      <DiscoveredJobCard
        job={makeJob({ discovery_source_id: "unknown-id" })}
        sources={[makeSource({ id: "src-1" })]}
      />,
    );
    expect(screen.queryByTestId("source-name-badge")).toBeNull();
  });
});
