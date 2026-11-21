import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MENU_ITEM_FOCUS_CLASS } from "../constants/menu-item-focus";
import MultiChipInput from "../components/ui/MultiChipInput";

describe("MENU_ITEM_FOCUS_CLASS", () => {
  it("styles the highlighted item and drops the bare outline-none", () => {
    expect(MENU_ITEM_FOCUS_CLASS).toContain("data-[highlighted]:bg-muted");
    expect(MENU_ITEM_FOCUS_CLASS).toContain("data-[highlighted]:ring-2");
  });

  it("is applied to a menu item that arrow keys move onto", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>Open</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item className={MENU_ITEM_FOCUS_CLASS} onSelect={vi.fn()}>One</DropdownMenu.Item>
            <DropdownMenu.Item className={MENU_ITEM_FOCUS_CLASS} onSelect={vi.fn()}>Two</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>,
    );
    screen.getByText("Open").focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    const two = screen.getByRole("menuitem", { name: "Two" });
    expect(two).toHaveAttribute("data-highlighted");
    expect(two.className).toContain("data-[highlighted]:ring-primary");
  });
});

describe("MultiChipInput keyboard focus", () => {
  it("shows a focus ring on the field and on chip remove buttons", () => {
    render(<MultiChipInput value={["Go"]} onChange={vi.fn()} />);
    expect(screen.getByRole("textbox").parentElement?.className).toContain("focus-within:ring-2");
    expect(screen.getByLabelText("Remove Go").className).toContain("focus-visible:ring-2");
  });
});
