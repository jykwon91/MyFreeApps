import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Panel, { PanelCloseButton, PanelTitle } from "../components/ui/Panel";
import type { PanelProps } from "../components/ui/Panel";
import Toaster from "../components/ui/Toaster";
import { showError } from "../lib/toast-store";

let isMobile = false;

beforeEach(() => {
  isMobile = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: isMobile,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function PanelHarness({ position }: Pick<PanelProps, "position">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open panel
      </button>
      {open ? (
        <Panel position={position} onClose={() => setOpen(false)}>
          <PanelTitle asChild>
            <h3>Edit vendor</h3>
          </PanelTitle>
          <input aria-label="Vendor name" />
          <PanelCloseButton onClose={() => setOpen(false)} />
        </Panel>
      ) : null}
    </>
  );
}

describe.each(["right", "center"] as const)("Panel (%s, desktop)", (position) => {
  it("is a modal dialog named by its heading", async () => {
    render(<PanelHarness position={position} />);
    await userEvent.click(screen.getByRole("button", { name: "Open panel" }));

    const dialog = screen.getByRole("dialog", { name: "Edit vendor" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Edit vendor" })).toHaveLength(1);
  });

  it("moves focus inside, closes on Escape and returns focus to the opener", async () => {
    render(<PanelHarness position={position} />);
    const opener = screen.getByRole("button", { name: "Open panel" });
    await userEvent.click(opener);

    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("closes when the backdrop is clicked", async () => {
    render(<PanelHarness position={position} />);
    await userEvent.click(screen.getByRole("button", { name: "Open panel" }));

    await userEvent.click(screen.getByTestId("panel-overlay"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps Tab focus inside the panel", async () => {
    render(<PanelHarness position={position} />);
    await userEvent.click(screen.getByRole("button", { name: "Open panel" }));
    const dialog = screen.getByRole("dialog");

    for (let i = 0; i < 4; i += 1) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});

describe("Panel with a toast showing", () => {
  beforeEach(() => {
    // jsdom lacks pointer capture, which the toast's swipe handling calls.
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.hasPointerCapture = () => false;
  });

  it("stays open when the toast is dismissed", async () => {
    render(
      <>
        <PanelHarness position="right" />
        <Toaster />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open panel" }));
    act(() => showError("I couldn't save those changes. Want to try again?"));

    const toast = await screen.findByText("I couldn't save those changes. Want to try again?");
    const toastItem = toast.closest("li");
    expect(toastItem).not.toBeNull();
    // The modal panel hides the page behind it from screen readers, toasts
    // included (Radix still announces each toast through its own live region).
    await userEvent.click(within(toastItem as HTMLElement).getByRole("button", { hidden: true }));

    expect(screen.getByRole("dialog", { name: "Edit vendor" })).toBeInTheDocument();
  });
});

describe("Panel (right, mobile)", () => {
  it("renders a drawer dialog named by its heading", async () => {
    isMobile = true;
    render(<PanelHarness position="right" />);
    await userEvent.click(screen.getByRole("button", { name: "Open panel" }));

    expect(screen.getByRole("dialog", { name: "Edit vendor" })).toBeInTheDocument();
  });

  it("returns focus to the opener when closed", async () => {
    isMobile = true;
    render(<PanelHarness position="right" />);
    const opener = screen.getByRole("button", { name: "Open panel" });
    await userEvent.click(opener);

    await userEvent.click(screen.getByRole("button", { name: "Close panel" }));
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

describe("PanelCloseButton", () => {
  it("does not submit a surrounding form", async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onClose = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <PanelCloseButton onClose={onClose} label="Close viewer" />
      </form>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Close viewer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
