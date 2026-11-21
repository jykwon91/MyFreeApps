import * as Dialog from "@radix-ui/react-dialog";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ModalDialog from "@/shared/components/ui/ModalDialog";

function renderDialog(props: { onClose: () => void; preventClose?: boolean; hasDescription?: boolean }) {
  return render(
    <ModalDialog testId="modal" panelClassName="panel" {...props}>
      <Dialog.Title>Undo extension</Dialog.Title>
      {props.hasDescription && <Dialog.Description>Roll the end date back.</Dialog.Description>}
      <button type="button">Confirm</button>
    </ModalDialog>,
  );
}

describe("ModalDialog", () => {
  it("closes on Escape", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("stays open on a click on the backdrop or the panel", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    const dialog = screen.getByRole("dialog");

    await userEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = dialog.parentElement as HTMLElement;
    await userEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("stays open on Escape while its work is in flight", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose, preventClose: true });

    await userEvent.keyboard("{Escape}");

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
