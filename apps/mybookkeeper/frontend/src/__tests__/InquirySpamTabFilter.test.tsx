import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InquirySpamTabFilter from "@/app/features/inquiries/InquirySpamTabFilter";

describe("InquirySpamTabFilter", () => {
  it("is a group of toggle buttons with only the current filter pressed", () => {
    render(<InquirySpamTabFilter value="flagged" onChange={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Filter inquiries by spam status" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByTestId("inquiry-spam-tab-flagged")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("inquiry-spam-tab-all")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("inquiry-spam-tab-clean")).toHaveAttribute("aria-pressed", "false");
  });

  it("presses All when there is no spam filter", () => {
    render(<InquirySpamTabFilter value={null} onChange={vi.fn()} />);
    expect(screen.getByTestId("inquiry-spam-tab-all")).toHaveAttribute("aria-pressed", "true");
  });

  it("reports the chosen spam status", async () => {
    const onChange = vi.fn();
    render(<InquirySpamTabFilter value={null} onChange={onChange} />);
    await userEvent.click(screen.getByTestId("inquiry-spam-tab-spam"));
    expect(onChange).toHaveBeenCalledWith("spam");
  });
});
