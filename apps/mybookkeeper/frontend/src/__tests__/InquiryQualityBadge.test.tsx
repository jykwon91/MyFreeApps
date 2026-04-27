import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InquiryQualityBadge from "@/app/features/inquiries/InquiryQualityBadge";

describe("InquiryQualityBadge", () => {
  it("renders the sparse badge when score is 0 or 1", () => {
    const { unmount } = render(
      <InquiryQualityBadge
        signals={{
          desired_start_date: null,
          desired_end_date: null,
          inquirer_employer: null,
          last_message_body: null,
        }}
      />,
    );
    expect(screen.getByTestId("inquiry-quality-badge-sparse")).toBeInTheDocument();
    expect(screen.getByText(/Sparse/i)).toBeInTheDocument();
    unmount();

    // Score 1
    render(
      <InquiryQualityBadge
        signals={{
          desired_start_date: "2026-06-01",
          desired_end_date: null,
          inquirer_employer: null,
          last_message_body: null,
        }}
      />,
    );
    expect(screen.getByTestId("inquiry-quality-badge-sparse")).toBeInTheDocument();
  });

  it("renders nothing for score 2 (standard tier)", () => {
    const { container } = render(
      <InquiryQualityBadge
        signals={{
          desired_start_date: "2026-06-01",
          desired_end_date: "2026-08-31",
          inquirer_employer: null,
          last_message_body: null,
        }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for score 3 (standard tier)", () => {
    const { container } = render(
      <InquiryQualityBadge
        signals={{
          desired_start_date: "2026-06-01",
          desired_end_date: "2026-08-31",
          inquirer_employer: "Texas Children's",
          last_message_body: null,
        }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the complete badge when score is 4", () => {
    render(
      <InquiryQualityBadge
        signals={{
          desired_start_date: "2026-06-01",
          desired_end_date: "2026-08-31",
          inquirer_employer: "Texas Children's",
          last_message_body: "a".repeat(120),
        }}
      />,
    );
    expect(screen.getByTestId("inquiry-quality-badge-complete")).toBeInTheDocument();
    expect(screen.getByText(/Complete/i)).toBeInTheDocument();
  });

  it("includes an accessible aria-label naming the score", () => {
    render(
      <InquiryQualityBadge
        signals={{
          desired_start_date: "2026-06-01",
          desired_end_date: "2026-08-31",
          inquirer_employer: "Texas Children's",
          last_message_body: "a".repeat(120),
        }}
      />,
    );
    const badge = screen.getByTestId("inquiry-quality-badge-complete");
    expect(badge.getAttribute("aria-label")).toMatch(/4 of 4/);
  });
});
