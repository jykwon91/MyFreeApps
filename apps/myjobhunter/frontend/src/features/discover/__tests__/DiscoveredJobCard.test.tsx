/**
 * Tests for DiscoveredJobCard — specifically the verdict-based badge render
 * introduced in the audit cleanup (replaces the old bandForScore helper).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DiscoveredJobCard from "../DiscoveredJobCard";
import type { DiscoveredJob } from "@/types/discovery/discovered-job";

vi.mock("lucide-react", () => ({
  Bookmark: () => null,
  Briefcase: () => null,
  Check: () => null,
  ExternalLink: () => null,
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
}));

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
    render(<DiscoveredJobCard job={makeJob({ verdict: null })} />);
    expect(screen.queryByTestId("badge")).toBeNull();
  });

  it("shows 'Strong fit' badge for strong_fit verdict", () => {
    render(<DiscoveredJobCard job={makeJob({ verdict: "strong_fit", score: 90 })} />);
    expect(screen.getByTestId("badge")).toHaveTextContent("Strong fit");
  });

  it("shows 'Worth considering' badge for worth_considering verdict", () => {
    render(<DiscoveredJobCard job={makeJob({ verdict: "worth_considering", score: 70 })} />);
    expect(screen.getByTestId("badge")).toHaveTextContent("Worth considering");
  });

  it("shows 'Stretch' badge for stretch verdict", () => {
    render(<DiscoveredJobCard job={makeJob({ verdict: "stretch", score: 40 })} />);
    expect(screen.getByTestId("badge")).toHaveTextContent("Stretch");
  });

  it("shows 'Mismatch' badge for mismatch verdict", () => {
    render(<DiscoveredJobCard job={makeJob({ verdict: "mismatch", score: 15 })} />);
    expect(screen.getByTestId("badge")).toHaveTextContent("Mismatch");
  });

  it("renders the job title and company name", () => {
    render(<DiscoveredJobCard job={makeJob()} />);
    expect(screen.getByText("Senior Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
  });
});
