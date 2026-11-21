import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TilePicker from "../components/ui/TilePicker";
import type { TileOption } from "../components/ui/TilePicker";

const OPTIONS: TileOption[] = [
  { value: "single", label: "Single", description: "Unmarried" },
  { value: "married", label: "Married", description: "Joint return" },
  { value: "head", label: "Head of household", description: "Dependents" },
];

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <TilePicker options={OPTIONS} value={value} onChange={setValue} ariaLabel="Filing status" />;
}

describe("TilePicker", () => {
  it("is a named radiogroup with one radio per option", () => {
    render(<Harness initial="married" />);
    expect(screen.getByRole("radiogroup", { name: "Filing status" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("exposes only the chosen option as checked", () => {
    render(<Harness initial="married" />);
    expect(screen.getByRole("radio", { checked: true })).toHaveTextContent("Married");
    expect(screen.getAllByRole("radio", { checked: false })).toHaveLength(2);
  });

  it("makes the chosen option the only tab stop", () => {
    render(<Harness initial="married" />);
    const tabStops = screen.getAllByRole("radio").filter((r) => r.tabIndex === 0);
    expect(tabStops).toHaveLength(1);
    expect(tabStops[0]).toHaveTextContent("Married");
  });

  it("makes the first option the tab stop when nothing is chosen", () => {
    render(<Harness initial="" />);
    expect(screen.queryByRole("radio", { checked: true })).toBeNull();
    expect(screen.getByRole("radio", { name: /Single/ }).tabIndex).toBe(0);
  });

  it("selects on click", async () => {
    const onChange = vi.fn();
    render(<TilePicker options={OPTIONS} value="single" onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole("radio", { name: /Married/ }));
    expect(onChange).toHaveBeenCalledWith("married");
  });

  it("moves focus and selection with the arrow keys, wrapping at the ends", async () => {
    const user = userEvent.setup();
    render(<Harness initial="single" />);
    screen.getByRole("radio", { name: /Single/ }).focus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: /Married/ })).toHaveFocus();
    expect(screen.getByRole("radio", { checked: true })).toHaveTextContent("Married");

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /Head of household/ })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: /Single/ })).toHaveFocus();
    expect(screen.getByRole("radio", { checked: true })).toHaveTextContent("Single");

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("radio", { name: /Head of household/ })).toHaveFocus();
    expect(screen.getByRole("radio", { checked: true })).toHaveTextContent("Head of household");
  });

  it("jumps to the first and last option with Home and End", async () => {
    const user = userEvent.setup();
    render(<Harness initial="married" />);
    screen.getByRole("radio", { name: /Married/ }).focus();

    await user.keyboard("{End}");
    expect(screen.getByRole("radio", { checked: true })).toHaveTextContent("Head of household");
    await user.keyboard("{Home}");
    expect(screen.getByRole("radio", { checked: true })).toHaveTextContent("Single");
  });
});
