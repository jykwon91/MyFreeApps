import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Download, Pencil, Trash2 } from "lucide-react";
import RowActions from "@/components/RowActions";

describe("RowActions", () => {
  it("renders one labelled button per action and fires its handler", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <RowActions
        actions={[
          { key: "edit", label: "Edit Acme", icon: Pencil, onClick: onEdit },
          { key: "delete", label: "Delete Acme", icon: Trash2, onClick: onDelete, destructive: true },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Acme" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Acme" }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Delete Acme" }).className).toContain("text-destructive");
  });

  it("only hides the buttons on hover-capable devices and reveals them on keyboard focus", () => {
    const { container } = render(
      <RowActions actions={[{ key: "edit", label: "Edit", icon: Pencil, onClick: vi.fn() }]} />,
    );
    const classes = (container.firstElementChild as HTMLElement).className.split(" ");

    // A bare opacity-0 would hide the buttons from touch and keyboard users.
    expect(classes).not.toContain("opacity-0");
    expect(classes).toContain("hover-capable:opacity-0");
    expect(classes).toContain("hover-capable:group-hover:opacity-100");
    expect(classes).toContain("hover-capable:group-focus-within:opacity-100");
  });

  it("disables a button when its action is disabled", () => {
    const onClick = vi.fn();
    render(<RowActions actions={[{ key: "dl", label: "Download", icon: Download, onClick, disabled: true }]} />);

    const button = screen.getByRole("button", { name: "Download" });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
