import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Toaster from "../components/ui/Toaster";
import { showError } from "../lib/toast-store";
import { tailwindZIndex } from "./tailwindZIndex";

const MESSAGE = "Couldn't save those changes — please try again.";

function DialogHarness({ onCancel }: { onCancel: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Edit recipe
      </button>
      <ConfirmDialog
        open={open}
        title="Edit recipe details"
        description="Change the title."
        onConfirm={() => showError(MESSAGE)}
        onCancel={onCancel}
      />
      <Toaster />
    </>
  );
}

function renderHarness() {
  const onCancel = vi.fn();
  render(<DialogHarness onCancel={onCancel} />);
  return { onCancel };
}

describe("Toaster while a modal dialog is open", () => {
  // Compares against the shared ConfirmDialog's backdrop (z-[70]); app-level
  // overlays aren't rendered here, so this guards the shared modals only.
  it("stacks a toast raised from the dialog above the dialog's backdrop", async () => {
    renderHarness();
    await userEvent.click(screen.getByRole("button", { name: "Edit recipe" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await screen.findByText(MESSAGE);

    const backdrop = document.querySelector('[data-state="open"].fixed.inset-0');
    const viewport = screen.getByRole("list", { hidden: true });
    expect(backdrop).not.toBeNull();
    expect(tailwindZIndex(viewport)).toBeGreaterThan(tailwindZIndex(backdrop as Element));
  });

  it("announces a toast raised from the dialog to screen readers", async () => {
    renderHarness();
    await userEvent.click(screen.getByRole("button", { name: "Edit recipe" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    // The dialog hides the page (toasts included) from assistive tech; the toast
    // reaches screen readers through Radix's live region, which is not hidden.
    const announcement = await screen.findByRole("status");
    await waitFor(() => expect(announcement).toHaveTextContent(MESSAGE));
    expect(announcement).toHaveAttribute("aria-live", "assertive");
  });

  it("dismisses a toast raised before the dialog opened, leaving the dialog open", async () => {
    const { onCancel } = renderHarness();
    act(() => showError(MESSAGE));
    await screen.findByText(MESSAGE);
    await userEvent.click(screen.getByRole("button", { name: "Edit recipe" }));
    await screen.findByRole("dialog", { name: "Edit recipe details" });

    // user-event refuses to click an element with pointer-events: none, which
    // Radix sets on layers older than the modal unless the toast overrides it.
    await userEvent.click(screen.getByLabelText("Dismiss notification"));

    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Edit recipe details" })).toBeInTheDocument();
  });
});
