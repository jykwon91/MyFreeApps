import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScreeningResultCard from "@/app/features/screening/ScreeningResultCard";
import type { ScreeningResult } from "@/shared/types/applicant/screening-result";

function makeResult(overrides: Partial<ScreeningResult> = {}): ScreeningResult {
  return {
    id: "result-1",
    applicant_id: "app-1",
    provider: "keycheck",
    status: "pass",
    report_storage_key: "screening/app-1/report.pdf",
    adverse_action_snippet: null,
    notes: null,
    requested_at: "2026-05-01T10:00:00Z",
    completed_at: "2026-05-01T10:30:00Z",
    uploaded_at: "2026-05-01T11:00:00Z",
    uploaded_by_user_id: "user-1",
    created_at: "2026-05-01T10:00:00Z",
    presigned_url: "https://storage.example.com/signed-url",
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

  it("shows the download link when presigned_url is set", () => {
    render(<ScreeningResultCard result={makeResult()} />);
    const link = screen.getByTestId("screening-download-result-1");
    expect(link).toHaveAttribute("href", "https://storage.example.com/signed-url");
  });

  it("hides the download link when presigned_url is null", () => {
    render(<ScreeningResultCard result={makeResult({ presigned_url: null })} />);
    expect(screen.queryByTestId("screening-download-result-1")).not.toBeInTheDocument();
  });

  it("does not show the adverse action section when snippet is null", () => {
    render(<ScreeningResultCard result={makeResult({ adverse_action_snippet: null })} />);
    expect(screen.queryByTestId("screening-snippet-toggle-result-1")).not.toBeInTheDocument();
  });

  it("shows the snippet toggle when adverse_action_snippet is set", () => {
    render(
      <ScreeningResultCard
        result={makeResult({ adverse_action_snippet: "Credit score below threshold" })}
      />,
    );
    expect(screen.getByTestId("screening-snippet-toggle-result-1")).toBeInTheDocument();
    // Snippet text is collapsed by default
    expect(screen.queryByTestId("screening-snippet-text-result-1")).not.toBeInTheDocument();
  });

  it("expands the snippet on toggle click", async () => {
    render(
      <ScreeningResultCard
        result={makeResult({ adverse_action_snippet: "Credit score below threshold" })}
      />,
    );
    await userEvent.click(screen.getByTestId("screening-snippet-toggle-result-1"));
    expect(screen.getByTestId("screening-snippet-text-result-1")).toHaveTextContent(
      "Credit score below threshold",
    );
  });

  it("collapses the snippet on second toggle click", async () => {
    render(
      <ScreeningResultCard
        result={makeResult({ adverse_action_snippet: "Credit score below threshold" })}
      />,
    );
    await userEvent.click(screen.getByTestId("screening-snippet-toggle-result-1"));
    await userEvent.click(screen.getByTestId("screening-snippet-toggle-result-1"));
    expect(screen.queryByTestId("screening-snippet-text-result-1")).not.toBeInTheDocument();
  });
});
