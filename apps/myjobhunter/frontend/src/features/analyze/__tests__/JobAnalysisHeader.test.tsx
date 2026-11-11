import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import JobAnalysisHeader from "../JobAnalysisHeader";
import type { JobAnalysisExtracted } from "@myjobhunter/api-client/types/job-analysis/job-analysis-extracted";

const EXTRACTED: JobAnalysisExtracted = {
  title: null,
  company: "Acme",
  location: null,
  remote_type: null,
  posted_salary_min: null,
  posted_salary_max: null,
  posted_salary_currency: null,
  posted_salary_period: null,
  summary: null,
};

describe("JobAnalysisHeader", () => {
  it("links an https posting and fills in a missing role", () => {
    render(<JobAnalysisHeader extracted={EXTRACTED} sourceUrl="https://jobs.example.com/1" />);
    expect(screen.getByRole("heading", { name: "Untitled role" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://jobs.example.com/1" })).toHaveAttribute("href", "https://jobs.example.com/1");
  });

  it("shows a source that isn't http or https as text, never as a link", () => {
    render(<JobAnalysisHeader extracted={EXTRACTED} sourceUrl="javascript:alert(1)" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
  });
});
