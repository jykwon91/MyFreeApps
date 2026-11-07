import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardHeaderSubtitle from "@/app/features/dashboard/DashboardHeaderSubtitle";
import type { HealthSummary } from "@/shared/types/health/health-summary";

function healthWithFailures(documentsFailed: number): HealthSummary {
  return {
    status: "degraded",
    active_problems: [],
    recent_events: [],
    stats: {
      documents_processing: 0,
      documents_failed: documentsFailed,
      documents_retry_pending: 0,
      extractions_today: 0,
      corrections_today: 0,
      api_tokens_today: 0,
    },
  };
}

function renderWarning(documentsFailed: number) {
  render(
    <MemoryRouter>
      <DashboardHeaderSubtitle
        mode="health-warning"
        dateRange={undefined}
        healthSummary={healthWithFailures(documentsFailed)}
      />
    </MemoryRouter>,
  );
}

describe("DashboardHeaderSubtitle health warning", () => {
  it("says one failed document in the singular", () => {
    renderWarning(1);
    expect(screen.getByText("1 failed document")).toBeInTheDocument();
  });

  it("says several failed documents in the plural", () => {
    renderWarning(4);
    expect(screen.getByText("4 failed documents")).toBeInTheDocument();
  });

  it("links to system health", () => {
    renderWarning(2);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/system-health");
  });
});
