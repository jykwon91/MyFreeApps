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

    await user.click(screen.getByRole("radio", { name: /Email/ }));
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("calls onSelect with 'a' when side A clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MergeFieldRow {...defaultProps} selected="b" onSelect={onSelect} />);

    await user.click(screen.getByRole("radio", { name: /Upload/ }));
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

  it("exposes the two sides as a radiogroup named after the field, with the chosen side checked", () => {
    render(<MergeFieldRow {...defaultProps} selected="b" />);
    expect(screen.getByRole("radiogroup", { name: "Vendor" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { checked: true })).toHaveTextContent("ACME Corporation");
    expect(screen.getByRole("radio", { name: /Upload/, checked: false })).toBeInTheDocument();
  });

  it("moves the choice to the other side with the arrow keys", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MergeFieldRow {...defaultProps} onSelect={onSelect} />);
    screen.getByRole("radio", { name: /Upload/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /Email/ })).toHaveFocus();
    expect(onSelect).toHaveBeenCalledWith("b");
  });
});
