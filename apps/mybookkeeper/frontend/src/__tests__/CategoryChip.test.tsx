import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CategoryChip from "@/app/features/dashboard/CategoryChip";

describe("CategoryChip", () => {
  it("renders category label formatted", () => {
    render(
      <CategoryChip
        category="utilities"
        selected={true}
        allSelected={false}
        onToggle={vi.fn()}
        onSelectOnly={vi.fn()}
      />,
    );
    expect(screen.getByText("Utilities")).toBeInTheDocument();
  });

  it("sets aria-pressed=true when selected", () => {
    render(
      <CategoryChip
        category="utilities"
        selected={true}
        allSelected={false}
        onToggle={vi.fn()}
        onSelectOnly={vi.fn()}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("sets aria-pressed=false when not selected", () => {
    render(
      <CategoryChip
        category="utilities"
        selected={false}
        allSelected={false}
        onToggle={vi.fn()}
        onSelectOnly={vi.fn()}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onSelectOnly when allSelected and clicked", async () => {
    const user = userEvent.setup();
    const onSelectOnly = vi.fn();
    render(
      <CategoryChip
        category="utilities"
        selected={true}
        allSelected={true}
        onToggle={vi.fn()}
        onSelectOnly={onSelectOnly}
      />,
    );
    await user.click(screen.getByRole("button"));
    expect(onSelectOnly).toHaveBeenCalledWith("utilities");
  });

  it("calls onToggle when not allSelected and clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <CategoryChip
        category="utilities"
        selected={true}
        allSelected={false}
        onToggle={onToggle}
        onSelectOnly={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledWith("utilities");
  });
});
