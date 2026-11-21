import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SidebarUserMenu from "@/shared/components/SidebarUserMenu";
import type { UserProfile } from "@/shared/types/user/user";

const { logoutMock } = vi.hoisted(() => ({ logoutMock: vi.fn() }));
vi.mock("@/shared/lib/auth", () => ({ logout: logoutMock }));

const USER: UserProfile = {
  id: "u1",
  email: "jane@example.com",
  name: "Jane",
  role: "admin",
  is_active: true,
  is_superuser: false,
  is_verified: true,
};

function renderMenu(showAdminLink: boolean, onNavigate = vi.fn()) {
  render(
    <MemoryRouter>
      <SidebarUserMenu user={USER} showAdminLink={showAdminLink} onNavigate={onNavigate} />
    </MemoryRouter>,
  );
  return { toggle: screen.getByRole("button", { name: /jane/i }), onNavigate };
}

describe("SidebarUserMenu", () => {
  it("tells assistive tech it opens a menu, and whether it is open", async () => {
    const user = userEvent.setup();
    const { toggle } = renderMenu(true);
    expect(toggle).toHaveAttribute("aria-haspopup", "menu");
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("menuitem", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
  });

  it("opens from the keyboard and closes on Escape, back on the toggle", async () => {
    const user = userEvent.setup();
    const { toggle } = renderMenu(false);
    toggle.focus();

    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    await waitFor(() => expect(menu).toContainElement(document.activeElement as HTMLElement));
    expect(screen.queryByRole("menuitem", { name: "Admin" })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("signs out from the menu", async () => {
    const user = userEvent.setup();
    const { toggle } = renderMenu(false);
    await user.click(toggle);
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(logoutMock).toHaveBeenCalledOnce();
  });

  it("closes the sidebar when the Admin item is followed", async () => {
    const user = userEvent.setup();
    const { toggle, onNavigate } = renderMenu(true);
    await user.click(toggle);
    await user.click(await screen.findByRole("menuitem", { name: "Admin" }));
    expect(onNavigate).toHaveBeenCalledOnce();
  });
});
