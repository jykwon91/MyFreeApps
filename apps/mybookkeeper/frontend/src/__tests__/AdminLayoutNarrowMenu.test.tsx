/**
 * On a narrow screen the admin sidebar is a slide-in menu. Closed, its links
 * must be out of the page, not just pushed off-screen, so keyboard and
 * screen-reader users don't tab through links they cannot see.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminLayout from "@/admin/components/AdminLayout";
import { NARROW_LAYOUT_QUERY } from "@/shared/lib/layout-breakpoints";

vi.mock("@/shared/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    user: {
      id: "u1",
      email: "admin@example.com",
      name: "Ada",
      role: "admin",
      is_active: true,
      is_superuser: true,
      is_verified: true,
    },
    isLoading: false,
    isError: false,
    error: undefined,
  }),
}));
vi.mock("@/shared/store/healthApi", () => ({
  useGetHealthSummaryQuery: () => ({ data: undefined }),
}));
vi.mock("@/shared/store/versionApi", () => ({
  useGetVersionQuery: () => ({ data: undefined }),
}));

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query === NARROW_LAYOUT_QUERY,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

function renderAdmin() {
  render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<button type="button">Page action</button>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminLayout on a narrow screen", () => {
  it("keeps the closed menu's links out of the page", async () => {
    const user = userEvent.setup();
    renderAdmin();

    expect(screen.queryByRole("link", { name: "System Health" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ada/i })).not.toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Page action" })).toHaveFocus();
  });

  it("opens with focus inside, keeps every nav item, and closes on Escape", async () => {
    const user = userEvent.setup();
    renderAdmin();
    const opener = screen.getByRole("button", { name: "Open menu" });

    await user.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Admin" });
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    for (const label of ["Users & Orgs", "System Health", "Cost Monitoring", "User Activity", "Demo", "Back to app"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });
});
