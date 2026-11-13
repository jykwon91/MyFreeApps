import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import TabList from "@/games/wow-forever/components/shared/TabList";

const TABS = ["one", "two", "three"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = { one: "One", two: "Two", three: "Three" };

function Harness() {
  const [tab, setTab] = useState<Tab>("one");
  return <TabList tabs={TABS} labels={LABELS} current={tab} onSelect={setTab} label="Sections" idPrefix="t" layout="scroll" />;
}

const tab = (name: string) => screen.getByRole("tab", { name });

describe("TabList", () => {
  it("marks the current tab selected and keeps only it in the Tab order, pointing every tab at the panel", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "Sections" })).toBeInTheDocument();
    expect(tab("One")).toHaveAttribute("aria-selected", "true");
    expect(tab("One")).toHaveAttribute("tabIndex", "0");
    expect(tab("Two")).toHaveAttribute("tabIndex", "-1");
    expect(tab("Two")).toHaveAttribute("aria-controls", "t-panel");
    expect(tab("Two")).toHaveAttribute("id", "t-tab-two");
  });

  it("moves with the arrows (wrapping), Home and End, focusing the new tab", () => {
    render(<Harness />);
    fireEvent.keyDown(tab("One"), { key: "ArrowLeft" });
    expect(tab("Three")).toHaveAttribute("aria-selected", "true");
    expect(tab("Three")).toHaveFocus();
    fireEvent.keyDown(tab("Three"), { key: "ArrowRight" });
    expect(tab("One")).toHaveFocus();
    fireEvent.keyDown(tab("One"), { key: "End" });
    expect(tab("Three")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("Three"), { key: "Home" });
    expect(tab("One")).toHaveAttribute("aria-selected", "true");
  });

  it("leaves modified arrows alone (Alt+Left is the browser's Back)", () => {
    render(<Harness />);
    const event = fireEvent.keyDown(tab("One"), { key: "ArrowRight", altKey: true });
    expect(event).toBe(true); // not prevented
    expect(tab("One")).toHaveAttribute("aria-selected", "true");
  });

  it("selects on click", () => {
    render(<Harness />);
    fireEvent.click(tab("Two"));
    expect(tab("Two")).toHaveAttribute("aria-selected", "true");
  });
});
