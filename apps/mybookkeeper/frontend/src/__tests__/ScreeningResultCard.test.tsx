import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScreeningResultCard from "@/app/features/screening/ScreeningResultCard";
import type { ScreeningReport } from "@mybookkeeper/api-client/types/applicant/screening-report";
import type { ScreeningResult } from "@mybookkeeper/api-client/types/applicant/screening-result";

function makeResult(overrides: Partial<ScreeningResult> = {}): ScreeningResult {
  return {
    id: "result-1",
    applicant_id: "app-1",
    provider: "keycheck",
    status: "pass",
    has_report: true,
    notes: null,
    requested_at: "2026-05-01T10:00:00Z",
    completed_at: "2026-05-01T10:30:00Z",
    uploaded_at: "2026-05-01T11:00:00Z",
    uploaded_by_user_id: "user-1",
    created_at: "2026-05-01T10:00:00Z",
    ...overrides,
  };
}

function makeReport(overrides: Partial<ScreeningReport> = {}): ScreeningReport {
  return {
    id: "result-1",
    adverse_action_snippet: null,
    presigned_url: "https://storage.example.com/signed-url",
    is_available: true,
    ...overrides,
  };
}

describe("ScreeningResultCard", () => {
  it("renders the pass status badge", () => {
    render(<ScreeningResultCard result={makeResult({ status: "pass" })} />);
    const card = screen.getByTestId("screening-result-card-result-1");
    expect(card).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
  });

  it("renders the fail status badge", () => {
    render(<ScreeningResultCard result={makeResult({ status: "fail" })} />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders the inconclusive status badge", () => {
    render(<ScreeningResultCard result={makeResult({ status: "inconclusive" })} />);
    expect(screen.getByText("Inconclusive")).toBeInTheDocument();
  });

  it("renders the provider label", () => {
    render(<ScreeningResultCard result={makeResult({ provider: "rentspree" })} />);
    expect(screen.getByText("RentSpree")).toBeInTheDocument();
  });

  it("says the report is hidden until sensitive data is shown", () => {
    render(<ScreeningResultCard result={makeResult()} />);
    expect(screen.getByTestId("screening-report-hidden-result-1")).toBeInTheDocument();
    expect(screen.queryByTestId("screening-download-result-1")).not.toBeInTheDocument();
  });

  it("says nothing about a report when there isn't one", () => {
    render(<ScreeningResultCard result={makeResult({ has_report: false })} />);
    expect(screen.queryByTestId("screening-report-hidden-result-1")).not.toBeInTheDocument();
  });

  it("links to the report once shown", () => {
    render(<ScreeningResultCard result={makeResult()} report={makeReport()} />);
    const link = screen.getByTestId("screening-download-result-1");
    expect(link).toHaveAttribute("href", "https://storage.example.com/signed-url");
    expect(screen.queryByTestId("screening-report-hidden-result-1")).not.toBeInTheDocument();
  });

  it("says when the report file is missing", () => {
    render(
      <ScreeningResultCard
        result={makeResult()}
        report={makeReport({ presigned_url: null, is_available: false })}
      />,
    );
    expect(screen.getByTestId("screening-report-missing-result-1")).toBeInTheDocument();
    expect(screen.queryByTestId("screening-download-result-1")).not.toBeInTheDocument();
  });

  it("has no adverse action section when the snippet is null", () => {
    render(<ScreeningResultCard result={makeResult()} report={makeReport()} />);
    expect(screen.queryByTestId("screening-snippet-toggle-result-1")).not.toBeInTheDocument();
  });

  it("collapses the adverse action reason by default", () => {
    render(
      <ScreeningResultCard
        result={makeResult()}
        report={makeReport({ adverse_action_snippet: "Credit score below threshold" })}
      />,
    );
    expect(screen.getByTestId("screening-snippet-toggle-result-1")).toBeInTheDocument();
    expect(screen.queryByTestId("screening-snippet-text-result-1")).not.toBeInTheDocument();
  });

  it("expands and collapses the adverse action reason", async () => {
    render(
      <ScreeningResultCard
        result={makeResult()}
        report={makeReport({ adverse_action_snippet: "Credit score below threshold" })}
      />,
    );
    await userEvent.click(screen.getByTestId("screening-snippet-toggle-result-1"));
    expect(screen.getByTestId("screening-snippet-text-result-1")).toHaveTextContent(
      "Credit score below threshold",
    );
    await userEvent.click(screen.getByTestId("screening-snippet-toggle-result-1"));
    expect(screen.queryByTestId("screening-snippet-text-result-1")).not.toBeInTheDocument();
  });
});
