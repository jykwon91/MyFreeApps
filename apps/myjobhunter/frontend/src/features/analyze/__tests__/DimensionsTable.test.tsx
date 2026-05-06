import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DimensionsTable from "../DimensionsTable";
import type { JobAnalysisDimension } from "@/types/job-analysis/job-analysis-dimension";

vi.mock("lucide-react", () => ({
  AlertTriangle: () => null,
  CheckCircle2: () => null,
}));

const ALL_FIVE: JobAnalysisDimension[] = [
  { key: "skill_match", status: "strong", rationale: "Python + Postgres covered." },
  { key: "seniority", status: "aligned", rationale: "Senior matches senior." },
  { key: "salary", status: "in_range", rationale: "Range overlaps target." },
  { key: "location_remote", status: "compatible", rationale: "Remote OK." },
  { key: "work_auth", status: "compatible", rationale: "Citizen, fine." },
];

describe("DimensionsTable", () => {
  it("renders all five dimensions with labels and rationales", () => {
    render(
      <DimensionsTable
        dimensions={ALL_FIVE}
        redFlags={[]}
        greenFlags={[]}
      />,
    );
    expect(screen.getByText("Skill match")).toBeInTheDocument();
    expect(screen.getByText("Seniority")).toBeInTheDocument();
    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect(screen.getByText("Location & remote")).toBeInTheDocument();
    expect(screen.getByText("Work authorization")).toBeInTheDocument();

    expect(screen.getByText("Python + Postgres covered.")).toBeInTheDocument();
    expect(screen.getByText("Range overlaps target.")).toBeInTheDocument();
  });

  it("renders status badges with the right labels", () => {
    render(
      <DimensionsTable
        dimensions={ALL_FIVE}
        redFlags={[]}
        greenFlags={[]}
      />,
    );
    // Multiple "Compatible" rows exist (location + work_auth) — use getAllByText.
    expect(screen.getAllByText("Compatible").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Strong")).toBeInTheDocument();
    expect(screen.getByText("Aligned")).toBeInTheDocument();
    expect(screen.getByText("In range")).toBeInTheDocument();
  });

  it("renders dimensions in canonical order even if API returns reversed", () => {
    const reversed = [...ALL_FIVE].reverse();
    render(
      <DimensionsTable
        dimensions={reversed}
        redFlags={[]}
        greenFlags={[]}
      />,
    );
    const rows = screen.getAllByRole("row");
    // First row is the header; data rows start at index 1.
    const dataRowsText = rows.slice(1).map((r) => r.textContent ?? "");
    // Skill match row should come first.
    expect(dataRowsText[0]).toContain("Skill match");
    expect(dataRowsText[4]).toContain("Work authorization");
  });

  it("hides flag lists when both are empty", () => {
    render(
      <DimensionsTable
        dimensions={ALL_FIVE}
        redFlags={[]}
        greenFlags={[]}
      />,
    );
    expect(screen.queryByText("Red flags")).not.toBeInTheDocument();
    expect(screen.queryByText("Green flags")).not.toBeInTheDocument();
  });

  it("renders red flags when present", () => {
    render(
      <DimensionsTable
        dimensions={ALL_FIVE}
        redFlags={["No comp range disclosed", "Vague scope"]}
        greenFlags={[]}
      />,
    );
    expect(screen.getByText("Red flags")).toBeInTheDocument();
    expect(screen.getByText("No comp range disclosed")).toBeInTheDocument();
    expect(screen.getByText("Vague scope")).toBeInTheDocument();
  });

  it("renders green flags when present", () => {
    render(
      <DimensionsTable
        dimensions={ALL_FIVE}
        redFlags={[]}
        greenFlags={["Engineering practices listed", "Career growth budget"]}
      />,
    );
    expect(screen.getByText("Green flags")).toBeInTheDocument();
    expect(screen.getByText("Engineering practices listed")).toBeInTheDocument();
  });

  it("shows placeholder when dimensions array is empty", () => {
    render(
      <DimensionsTable dimensions={[]} redFlags={[]} greenFlags={[]} />,
    );
    expect(
      screen.getByText("No analysis available — try analyzing again."),
    ).toBeInTheDocument();
  });

  it("falls back gracefully on unknown status values", () => {
    render(
      <DimensionsTable
        dimensions={[
          {
            key: "skill_match",
            status: "asteroid_belt",
            rationale: "novel signal",
          },
          ...ALL_FIVE.slice(1),
        ]}
        redFlags={[]}
        greenFlags={[]}
      />,
    );
    // Unknown status falls through to the raw value rather than crashing.
    expect(screen.getByText("asteroid_belt")).toBeInTheDocument();
    expect(screen.getByText("novel signal")).toBeInTheDocument();
  });
});
