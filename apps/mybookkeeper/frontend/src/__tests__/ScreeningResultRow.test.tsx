import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScreeningResultRow from "@/app/features/screening/ScreeningResultRow";
import type { ScreeningResult } from "@/shared/types/applicant/screening-result";

function makeResult(overrides: Partial<ScreeningResult> = {}): ScreeningResult {
  return {
    id: "result-1",
    applicant_id: "app-1",
    provider: "keycheck",
    status: "pass",
    report_storage_key: "screening/app-1/r1.pdf",
    adverse_action_snippet: null,
    notes: null,
    requested_at: "2026-04-29T10:00:00Z",
    completed_at: "2026-04-29T10:00:00Z",
    uploaded_at: "2026-04-29T10:00:00Z",
    uploaded_by_user_id: "user-1",
    created_at: "2026-04-29T10:00:00Z",
    presigned_url: "https://signed.example/r1",
    ...overrides,
  };
}

describe("ScreeningResultRow", () => {
  it("renders the KeyCheck provider label and pass status badge", () => {
    render(<ul><ScreeningResultRow result={makeResult()} /></ul>);
    expect(screen.getByText("KeyCheck")).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
  });

  it("renders a Download link when presigned_url is present", () => {
    render(<ul><ScreeningResultRow result={makeResult()} /></ul>);
    const link = screen.getByTestId("screening-download-result-1");
    expect(link).toHaveAttribute("href", "https://signed.example/r1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not render a Download link when presigned_url is null", () => {
    render(
      <ul>
        <ScreeningResultRow result={makeResult({ presigned_url: null })} />
      </ul>,
    );
    expect(screen.queryByTestId("screening-download-result-1")).not.toBeInTheDocument();
  });

  it("hides the snippet section when no adverse_action_snippet is set", () => {
    render(<ul><ScreeningResultRow result={makeResult()} /></ul>);
    expect(
      screen.queryByTestId("screening-snippet-toggle-result-1"),
    ).not.toBeInTheDocument();
  });

  it("collapses the adverse-action snippet by default", () => {
    render(
      <ul>
        <ScreeningResultRow
          result={makeResult({
            status: "fail",
            adverse_action_snippet: "Credit score below threshold",
          })}
        />
      </ul>,
    );
    expect(screen.getByTestId("screening-snippet-toggle-result-1")).toBeInTheDocument();
    expect(
      screen.queryByTestId("screening-snippet-text-result-1"),
    ).not.toBeInTheDocument();
  });

  it("expands the adverse-action snippet when toggled", async () => {
    render(
      <ul>
        <ScreeningResultRow
          result={makeResult({
            status: "fail",
            adverse_action_snippet: "Credit score below threshold",
          })}
        />
      </ul>,
    );
    await userEvent.click(screen.getByTestId("screening-snippet-toggle-result-1"));
    expect(screen.getByTestId("screening-snippet-text-result-1")).toHaveTextContent(
      "Credit score below threshold",
    );
  });
});
