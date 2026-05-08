import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ToggleChipGroup from "../components/ui/ToggleChipGroup";

const OPTIONS = [
  { value: "finance", label: "Finance" },
  { value: "defense", label: "Defense" },
  { value: "gambling", label: "Gambling" },
];

describe("ToggleChipGroup", () => {
  it("renders all option labels and selects one on click", async () => {
    const onChange = vi.fn();
    render(<ToggleChipGroup options={OPTIONS} value={[]} onChange={onChange} />);
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("Defense")).toBeInTheDocument();
    expect(screen.getByText("Gambling")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Finance" }));
    expect(onChange).toHaveBeenCalledWith(["finance"]);
  });

  it("marks selected chips with aria-pressed=true and unselected with false", async () => {
    const onChange = vi.fn();
    render(
      <ToggleChipGroup
        options={OPTIONS}
        value={["finance"]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Finance" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Defense" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await userEvent.click(screen.getByRole("button", { name: "Defense" }));
    expect(onChange).toHaveBeenCalledWith(["finance", "defense"]);
  });

  it("deselects a chip when it is clicked while selected", async () => {
    const onChange = vi.fn();
    render(
      <ToggleChipGroup
        options={OPTIONS}
        value={["finance", "defense"]}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Finance" }));
    expect(onChange).toHaveBeenCalledWith(["defense"]);
  });

  it("supports multi-select — clicking two chips fires two independent onChange calls", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ToggleChipGroup options={OPTIONS} value={[]} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Finance" }));
    expect(onChange).toHaveBeenCalledWith(["finance"]);

    rerender(
      <ToggleChipGroup
        options={OPTIONS}
        value={["finance"]}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Defense" }));
    expect(onChange).toHaveBeenCalledWith(["finance", "defense"]);
  });

  it("renders no buttons when options array is empty and does not error", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <ToggleChipGroup options={[]} value={[]} onChange={onChange} />,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reflects controlled value changes without managing internal state", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ToggleChipGroup options={OPTIONS} value={[]} onChange={onChange} />,
    );
    expect(screen.getByRole("button", { name: "Finance" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    rerender(
      <ToggleChipGroup
        options={OPTIONS}
        value={["finance"]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Finance" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: "Finance" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
