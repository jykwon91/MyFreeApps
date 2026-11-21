import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import { FORM_DIALOG_WIDTH_CLASS } from "@/shared/components/ui/form-dialog-width-class";

/** The element carrying the max-width: the dialog panel. */
function panel(testId: string): HTMLElement {
  return screen.getByTestId(testId);
}

/** A page with a button that opens the dialog, the way every consumer mounts it. */
function OpenerHarness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Add thing
      </button>
      {open && (
        <FormDialogShell
          title="Add thing"
          testId="thing-dialog"
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
        >
          <input aria-label="Name" />
          <button type="submit">Save</button>
        </FormDialogShell>
      )}
    </>
  );
}

describe("FormDialogShell", () => {
  it("renders its title and children", () => {
    render(
      <FormDialogShell title="Add thing" testId="thing-dialog" onClose={vi.fn()}>
        <p>body</p>
      </FormDialogShell>,
    );

    expect(screen.getByRole("heading", { name: "Add thing" })).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("is announced as a modal dialog named by its title", () => {
    render(
      <FormDialogShell title="Add thing" testId="thing-dialog" onClose={vi.fn()}>
        <p>body</p>
      </FormDialogShell>,
    );

    const dialog = screen.getByRole("dialog", { name: "Add thing" });
    expect(dialog).toBe(panel("thing-dialog"));
  });

  it("moves focus into the dialog when it opens", async () => {
    render(<OpenerHarness />);

    await userEvent.click(screen.getByRole("button", { name: "Add thing" }));

    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  it("keeps Tab inside the dialog", async () => {
    render(<OpenerHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Add thing" }));
    const dialog = screen.getByRole("dialog");

    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("closes on Escape and returns focus to the button that opened it", async () => {
    const onClose = vi.fn();
    render(<OpenerHarness onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "Add thing" });
    await userEvent.click(opener);

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("returns focus to the opener when closed with the close button", async () => {
    render(<OpenerHarness />);
    const opener = screen.getByRole("button", { name: "Add thing" });
    await userEvent.click(opener);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("calls onClose when the close button is pressed", async () => {
    const onClose = vi.fn();
    render(
      <FormDialogShell title="Add thing" testId="thing-dialog" onClose={onClose}>
        <p>body</p>
      </FormDialogShell>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("defaults to the narrow width", () => {
    render(
      <FormDialogShell title="Add thing" testId="thing-dialog" onClose={vi.fn()}>
        <p>body</p>
      </FormDialogShell>,
    );

    expect(panel("thing-dialog")).toHaveClass(FORM_DIALOG_WIDTH_CLASS.narrow);
  });

  it("widens when asked to, so a two-column form is not squeezed into one", () => {
    render(
      <FormDialogShell
        title="Add thing"
        testId="thing-dialog"
        onClose={vi.fn()}
        width="wide"
      >
        <p>body</p>
      </FormDialogShell>,
    );

    const dialog = panel("thing-dialog");
    expect(dialog).toHaveClass(FORM_DIALOG_WIDTH_CLASS.wide);
    expect(dialog).not.toHaveClass(FORM_DIALOG_WIDTH_CLASS.narrow);
  });

  it("keeps a tall form scrollable rather than letting it overflow the viewport", () => {
    render(
      <FormDialogShell
        title="Add thing"
        testId="thing-dialog"
        onClose={vi.fn()}
        width="wide"
      >
        <p>body</p>
      </FormDialogShell>,
    );

    const dialog = panel("thing-dialog");
    expect(dialog).toHaveClass("max-h-[90vh]");
    expect(dialog).toHaveClass("overflow-y-auto");
  });
});
