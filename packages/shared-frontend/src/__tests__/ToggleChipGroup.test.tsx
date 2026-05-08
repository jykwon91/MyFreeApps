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
  it("renders all option labels", () => {
    render(<ToggleChipGroup options={OPTIONS} value={[]} onChange={() => {}} />);
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("Defense")).toBeInTheDocument();
    expect(screen.getByText("Gambling")).toBeInTheDocument();
  });

  it("marks selected chips with aria-pressed=true", () => {
    render(
      <ToggleChipGroup
        options={OPTIONS}
        value={["finance"]}
        onChange={() => {}}
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
  });

  it("calls onChange with value added when an unselected chip is clicked", async () => {
    const onChange = vi.fn();
    render(
      <ToggleChipGroup options={OPTIONS} value={[]} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Finance" }));
    expect(onChange).toHaveBeenCalledWith(["finance"]);
  });

  it("calls onChange with value removed when a selected chip is clicked", async () => {
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

  it("supports multi-select — multiple chips can be selected simultaneously", async () => {
    const selected: string[] = [];
    const onChange = vi.fn((next: string[]) => selected.push(...next));
    render(
      <ToggleChipGroup options={OPTIONS} value={[]} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Finance" }));
    expect(onChange).toHaveBeenCalledWith(["finance"]);
    await userEvent.click(screen.getByRole("button", { name: "Defense" }));
    expect(onChange).toHaveBeenCalledWith(["defense"]);
  });

  it("renders nothing when options array is empty", () => {
    const { container } = render(
      <ToggleChipGroup options={[]} value={[]} onChange={() => {}} />,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("reflects controlled value — does not manage internal state", () => {
    const { rerender } = render(
      <ToggleChipGroup options={OPTIONS} value={[]} onChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Finance" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    rerender(
      <ToggleChipGroup
        options={OPTIONS}
        value={["finance"]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Finance" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
