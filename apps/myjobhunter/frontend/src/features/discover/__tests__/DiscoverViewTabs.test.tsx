/**
 * Tests for the Discover view tabs: the WAI-ARIA tabs pattern (roles, roving tabindex, arrow/Home/End
 * keys with automatic activation) and the tabpanel the active tab labels.
 */
import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DiscoverTabPanel from "../DiscoverTabPanel";
import DiscoverViewTabs from "../DiscoverViewTabs";
import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";

function Harness({ initial = "inbox" }: { initial?: DiscoverView }) {
  const [view, setView] = useState<DiscoverView>(initial);
  return (
    <>
      <DiscoverViewTabs activeView={view} onSelect={setView} />
      <DiscoverTabPanel activeView={view}>content</DiscoverTabPanel>
    </>
  );
}

function tab(name: string): HTMLElement {
  return screen.getByRole("tab", { name });
}

describe("DiscoverViewTabs", () => {
  it("renders a named tablist of three tabs with ids and aria-controls", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "Discovery views" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    const panel = screen.getByRole("tabpanel");
    for (const name of ["Inbox", "Saved", "Dismissed"]) {
      expect(tab(name)).toHaveAttribute("id");
      expect(tab(name)).toHaveAttribute("aria-controls", panel.id);
    }
  });

  it("marks only the active tab selected and tabbable", () => {
    render(<Harness initial="saved" />);
    expect(tab("Saved")).toHaveAttribute("aria-selected", "true");
    expect(tab("Saved")).toHaveAttribute("tabindex", "0");
    for (const name of ["Inbox", "Dismissed"]) {
      expect(tab(name)).toHaveAttribute("aria-selected", "false");
      expect(tab(name)).toHaveAttribute("tabindex", "-1");
    }
  });

  it("labels the tabpanel by the active tab", () => {
    render(<Harness />);
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", tab("Inbox").id);
    fireEvent.click(tab("Dismissed"));
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", tab("Dismissed").id);
    expect(screen.getByRole("tabpanel", { name: "Dismissed" })).toBeInTheDocument();
  });

  it("ArrowRight and ArrowLeft move focus and activate, wrapping at the ends", () => {
    render(<Harness />);
    tab("Inbox").focus();
    fireEvent.keyDown(tab("Inbox"), { key: "ArrowRight" });
    expect(tab("Saved")).toHaveFocus();
    expect(tab("Saved")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("Saved"), { key: "ArrowLeft" });
    fireEvent.keyDown(tab("Inbox"), { key: "ArrowLeft" });
    expect(tab("Dismissed")).toHaveFocus();
    expect(tab("Dismissed")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("Dismissed"), { key: "ArrowRight" });
    expect(tab("Inbox")).toHaveFocus();
    expect(tab("Inbox")).toHaveAttribute("tabindex", "0");
  });

  it("Home and End jump to the first and last tab", () => {
    render(<Harness initial="saved" />);
    tab("Saved").focus();
    fireEvent.keyDown(tab("Saved"), { key: "End" });
    expect(tab("Dismissed")).toHaveFocus();
    expect(tab("Dismissed")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("Dismissed"), { key: "Home" });
    expect(tab("Inbox")).toHaveFocus();
    expect(tab("Inbox")).toHaveAttribute("aria-selected", "true");
  });

  it("leaves other keys alone", () => {
    render(<Harness />);
    tab("Inbox").focus();
    fireEvent.keyDown(tab("Inbox"), { key: "ArrowDown" });
    expect(tab("Inbox")).toHaveAttribute("aria-selected", "true");
  });
});
