import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InquirySpamBadge from "@/app/features/inquiries/InquirySpamBadge";

describe("InquirySpamBadge", () => {
  it("shows score for clean inquiries", () => {
    render(<InquirySpamBadge status="clean" score={85} />);
    expect(screen.getByText(/Clean · 85/)).toBeInTheDocument();
  });

  it("shows score for flagged inquiries", () => {
    render(<InquirySpamBadge status="flagged" score={42} />);
    expect(screen.getByText(/Flagged · 42/)).toBeInTheDocument();
  });

  it("shows 'Spam' for spam status", () => {
    render(<InquirySpamBadge status="spam" score={15} />);
    expect(screen.getByText(/Spam/)).toBeInTheDocument();
  });

  it("shows 'Unscored' when no score and unscored status", () => {
    render(<InquirySpamBadge status="unscored" score={null} />);
    expect(screen.getByText(/Unscored/)).toBeInTheDocument();
  });

  it("shows 'Cleared' for manually_cleared status", () => {
    render(<InquirySpamBadge status="manually_cleared" score={10} />);
    expect(screen.getByText(/Cleared/)).toBeInTheDocument();
  });
});
