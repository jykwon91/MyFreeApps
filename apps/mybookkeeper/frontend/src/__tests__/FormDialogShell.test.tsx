import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import { FORM_DIALOG_WIDTH_CLASS } from "@/shared/components/ui/form-dialog-width-class";

/** The element carrying the max-width, i.e. the panel inside the backdrop. */
function panel(testId: string): HTMLElement {
  const backdrop = screen.getByTestId(testId);
  const found = backdrop.firstElementChild;
  if (!(found instanceof HTMLElement)) throw new Error("no dialog panel");
  return found;
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
