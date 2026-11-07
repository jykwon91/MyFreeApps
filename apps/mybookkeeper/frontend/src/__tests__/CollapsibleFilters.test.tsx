import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CollapsibleFilters from "@/shared/components/ui/CollapsibleFilters";

function panelOf(toggle: HTMLElement): HTMLElement {
  const panel = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
  if (!panel) throw new Error("toggle does not control an element on the page");
  return panel;
}

describe("CollapsibleFilters", () => {
  it("renders its controls once, inside the panel the toggle controls", () => {
    render(
      <CollapsibleFilters activeCount={0} breakpoint="md">
        <input aria-label="Vendor" />
      </CollapsibleFilters>,
    );
    const toggle = screen.getByRole("button", { name: "Filters" });
    expect(screen.getAllByLabelText("Vendor")).toHaveLength(1);
    expect(panelOf(toggle)).toContainElement(screen.getByLabelText("Vendor"));
  });

  it("starts collapsed on phones and always shows from the breakpoint up", () => {
    render(
      <CollapsibleFilters activeCount={0} breakpoint="sm">
        <span>control</span>
      </CollapsibleFilters>,
    );
    const toggle = screen.getByRole("button", { name: "Filters" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveClass("sm:hidden");
    expect(panelOf(toggle)).toHaveClass("hidden", "sm:flex");
  });

  it("uses the md breakpoint when asked", () => {
    render(
      <CollapsibleFilters activeCount={0} breakpoint="md">
        <span>control</span>
      </CollapsibleFilters>,
    );
    const toggle = screen.getByRole("button", { name: "Filters" });
    expect(toggle).toHaveClass("md:hidden");
    expect(toggle).not.toHaveClass("sm:hidden");
    expect(panelOf(toggle)).toHaveClass("hidden", "md:flex");
  });

  it("the toggle opens and closes the panel", async () => {
    render(
      <CollapsibleFilters activeCount={0} breakpoint="sm">
        <span>control</span>
      </CollapsibleFilters>,
    );
    const toggle = screen.getByRole("button", { name: "Filters" });
    const panel = panelOf(toggle);

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).toHaveClass("flex");
    expect(panel).not.toHaveClass("hidden");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveClass("hidden");
  });

  it("names the toggle with the active count, and shows the count as a badge", () => {
    render(
      <CollapsibleFilters activeCount={2} breakpoint="sm">
        <span>control</span>
      </CollapsibleFilters>,
    );
    const toggle = screen.getByRole("button", { name: "Filters, 2 on" });
    expect(toggle).toHaveTextContent(/^Filters2$/);
  });

  it("gives each instance its own panel id", () => {
    render(
      <>
        <CollapsibleFilters activeCount={0} breakpoint="sm">
          <span>a</span>
        </CollapsibleFilters>
        <CollapsibleFilters activeCount={0} breakpoint="sm">
          <span>b</span>
        </CollapsibleFilters>
      </>,
    );
    const [first, second] = screen.getAllByRole("button", { name: "Filters" });
    expect(panelOf(first)).toHaveTextContent("a");
    expect(panelOf(second)).toHaveTextContent("b");
  });
});
