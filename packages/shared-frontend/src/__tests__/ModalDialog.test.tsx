import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ModalDialog from "../components/ui/ModalDialog";
import type { ModalDialogProps } from "../components/ui/ModalDialogProps";

type HarnessProps = Partial<Omit<ModalDialogProps, "children" | "testId" | "panelClassName">>;

function renderDialog(props: HarnessProps & { onClose: () => void }) {
  return render(
    <ModalDialog testId="modal" panelClassName="panel" overlayTestId="backdrop" {...props}>
      <Dialog.Title>Undo extension</Dialog.Title>
      {props.hasDescription && <Dialog.Description>Roll the end date back.</Dialog.Description>}
      <input aria-label="Reason" />
      <button type="button">Confirm</button>
    </ModalDialog>,
  );
}

/** A page with a button that opens the dialog, the way every consumer mounts it. */
function OpenerHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Behind</button>
      {open && (
        <ModalDialog testId="modal" panelClassName="panel" onClose={() => setOpen(false)}>
          <Dialog.Title>Undo extension</Dialog.Title>
          <input aria-label="Reason" />
          <button type="button">Confirm</button>
        </ModalDialog>
      )}
    </>
  );
}

describe("ModalDialog", () => {
  it("is a dialog named by its title, and hides the page behind from screen readers", async () => {
    const user = userEvent.setup();
    render(<OpenerHarness />);
    expect(screen.getByRole("button", { name: "Behind" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.getByRole("dialog", { name: "Undo extension" })).toHaveAttribute("data-testid", "modal");
    expect(screen.queryByRole("button", { name: "Behind" })).not.toBeInTheDocument();
  });

  it("moves focus inside on open and keeps Tab there", async () => {
    const user = userEvent.setup();
    render(<OpenerHarness />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 3; i += 1) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("closes on Escape and gives focus back to the opener", async () => {
    const user = userEvent.setup();
    render(<OpenerHarness />);
    const opener = screen.getByRole("button", { name: "Open" });

    await user.click(opener);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("stays open on a click on the backdrop or the panel by default", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    await userEvent.click(screen.getByRole("dialog"));
    await userEvent.click(screen.getByTestId("backdrop"));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on a click on the backdrop, not the panel, when asked to", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose, closeOnBackdropClick: true });

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId("backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("stays open on Escape and a backdrop click while its work is in flight", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose, preventClose: true, closeOnBackdropClick: true });

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByTestId("backdrop"));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("announces the description with the title when there is one", () => {
    renderDialog({ onClose: vi.fn(), hasDescription: true });

    const dialog = screen.getByRole("dialog", { name: "Undo extension" });
    expect(dialog).toHaveAccessibleDescription("Roll the end date back.");
  });

  it("points at no description when there is none", () => {
    renderDialog({ onClose: vi.fn() });

    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-describedby");
  });
});
