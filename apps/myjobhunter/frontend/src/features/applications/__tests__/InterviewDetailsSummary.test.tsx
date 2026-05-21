/**
 * Tests for the inline InterviewDetailsSummary read-view.
 *
 * Covers:
 * - Type row always renders.
 * - Optional rows (scheduled / duration / location / interviewers) are
 *   omitted when null/empty.
 * - URL-shaped locations render as a clickable link; plain strings render
 *   as text.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InterviewDetailsSummary from "../InterviewDetailsSummary";

describe("InterviewDetailsSummary", () => {
  it("renders only the Type row when no optional fields are set", () => {
    render(<InterviewDetailsSummary details={{ type: "phone" }} />);
    expect(screen.getByText(/^Type$/)).toBeInTheDocument();
    expect(screen.getByText(/Phone/)).toBeInTheDocument();
    expect(screen.queryByText(/Scheduled/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Duration/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Where/)).not.toBeInTheDocument();
    expect(screen.queryByText(/With/)).not.toBeInTheDocument();
  });

  it("renders duration when a positive number is provided", () => {
    render(
      <InterviewDetailsSummary
        details={{ type: "video", duration_minutes: 60 }}
      />,
    );
    expect(screen.getByText(/60 min/)).toBeInTheDocument();
  });

  it("hides duration when zero or negative", () => {
    render(
      <InterviewDetailsSummary
        details={{ type: "onsite", duration_minutes: 0 }}
      />,
    );
    expect(screen.queryByText(/Duration/)).not.toBeInTheDocument();
  });

  it("renders the location as a clickable link when it looks like a URL", () => {
    render(
      <InterviewDetailsSummary
        details={{
          type: "video",
          location_or_link: "https://meet.google.com/xyz",
        }}
      />,
    );
    const link = screen.getByRole("link", { name: /meet\.google\.com/i });
    expect(link).toHaveAttribute("href", "https://meet.google.com/xyz");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders a non-URL location as plain text", () => {
    render(
      <InterviewDetailsSummary
        details={{ type: "onsite", location_or_link: "123 Main St" }}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument();
  });

  it("joins interviewer names with a comma", () => {
    render(
      <InterviewDetailsSummary
        details={{
          type: "panel",
          interviewer_names: ["Sam Smith", "Alex Kim", "Jordan Lee"],
        }}
      />,
    );
    expect(screen.getByText(/Sam Smith, Alex Kim, Jordan Lee/)).toBeInTheDocument();
  });

  it("omits the interviewers row when the array is empty", () => {
    render(
      <InterviewDetailsSummary
        details={{ type: "phone", interviewer_names: [] }}
      />,
    );
    expect(screen.queryByText(/^With$/)).not.toBeInTheDocument();
  });
});
