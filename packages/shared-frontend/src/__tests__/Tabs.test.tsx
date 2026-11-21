import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Tabs from "../components/ui/Tabs";
import TabPanel from "../components/ui/TabPanel";
import type { TabOption } from "../types/tab-option";

type Key = "one" | "two" | "three";

const TABS: ReadonlyArray<TabOption<Key>> = [
  { value: "one", label: "One" },
  { value: "two", label: "Two" },
  { value: "three", label: "Three" },
];

function Harness({ tabs = TABS }: { tabs?: ReadonlyArray<TabOption<Key>> }) {
  const [value, setValue] = useState<Key>("one");
  return (
    <>
      <Tabs tabs={tabs} value={value} onChange={setValue} idPrefix="t" ariaLabel="Demo" tabClassName={() => ""} />
      <TabPanel idPrefix="t" value={value}>
        {value} content
      </TabPanel>
    </>
  );
}

describe("Tabs", () => {
  it("selects the first tab and keeps only it in the tab order", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "Demo" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("tabindex", "-1");
  });

  it("wires each tab to its panel and the panel back to the selected tab", async () => {
    render(<Harness />);
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("aria-controls", "t-panel");
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "t-panel");
    expect(panel).toHaveAttribute("aria-labelledby", "t-tab-one");
    expect(screen.getByRole("tabpanel", { name: "One" })).toBe(panel);

    await userEvent.click(screen.getByRole("tab", { name: "Two" }));
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "t-tab-two");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-controls", screen.getByRole("tabpanel").id);
  });

  it("moves selection and focus with the arrow keys, wrapping at the ends", async () => {
    render(<Harness />);
    screen.getByRole("tab", { name: "One" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Three" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Three" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("three content");
  });

  it("jumps to the first and last tab with Home and End", async () => {
    render(<Harness />);
    screen.getByRole("tab", { name: "One" }).focus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Three" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "One" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");
  });

  it("gives each tab its own panel when panelPerTab is set", () => {
    render(
      <>
        <Tabs tabs={TABS} value="two" onChange={() => {}} idPrefix="p" tabClassName={() => ""} panelPerTab />
        <TabPanel idPrefix="p" value="two" panelPerTab>
          body
        </TabPanel>
      </>,
    );
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("aria-controls", "p-panel-one");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-controls", screen.getByRole("tabpanel").id);
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "p-panel-two");
  });

  it("does not move when the next tab is disabled", async () => {
    render(<Harness tabs={TABS.map((tab) => ({ ...tab, disabled: tab.value === "two" }))} />);
    screen.getByRole("tab", { name: "One" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");
  });
});
