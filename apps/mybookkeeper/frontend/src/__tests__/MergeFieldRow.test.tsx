import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MergeFieldRow from "@/app/features/transactions/MergeFieldRow";

describe("MergeFieldRow", () => {
  const defaultProps = {
    field: "vendor" as const,
    labelA: "Upload",
    labelB: "Email",
    valueA: "Acme Corp",
    valueB: "ACME Corporation",
    selected: "a" as const,
    onSelect: vi.fn(),
  };

  it("renders field label", () => {
    render(<MergeFieldRow {...defaultProps} />);
    expect(screen.getByText("Vendor")).toBeInTheDocument();
  });

  it("renders both side values", () => {
    render(<MergeFieldRow {...defaultProps} />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("ACME Corporation")).toBeInTheDocument();
  });

  it("renders both side labels", () => {
    render(<MergeFieldRow {...defaultProps} />);
    expect(screen.getByText("Upload")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("calls onSelect with 'b' when side B clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MergeFieldRow {...defaultProps} onSelect={onSelect} />);

    const buttons = screen.getAllByRole("button");
    // Side B is the second button
    await user.click(buttons[1]);
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("calls onSelect with 'a' when side A clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MergeFieldRow {...defaultProps} selected="b" onSelect={onSelect} />);

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("renders dash for null values", () => {
    render(<MergeFieldRow {...defaultProps} valueA={null} />);
    const dashElements = screen.getAllByText("\u2014");
    expect(dashElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows amount warning icon when showAmountWarning is true", () => {
    const { container } = render(
      <MergeFieldRow {...defaultProps} field="amount" showAmountWarning={true} />,
    );
    const warningIcon = container.querySelector(".text-amber-500");
    expect(warningIcon).toBeInTheDocument();
  });
});
