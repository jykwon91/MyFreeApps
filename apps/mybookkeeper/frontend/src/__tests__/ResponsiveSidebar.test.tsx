import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, NavLink } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ResponsiveSidebar from "@/shared/components/ResponsiveSidebar";
import { NARROW_LAYOUT_QUERY } from "@/shared/lib/layout-breakpoints";

const originalMatchMedia = window.matchMedia;

function setNarrow(narrow: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: narrow && query === NARROW_LAYOUT_QUERY,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

function renderSidebar() {
  return render(
    <MemoryRouter>
      <ResponsiveSidebar title="MyBookkeeper" header={<p>Header bit</p>}>
        {(closeDrawer) => (
          <nav aria-label="Sidebar">
            <NavLink to="/transactions" onClick={closeDrawer}>
              Transactions
            </NavLink>
            <NavLink to="/documents" onClick={closeDrawer}>
              Documents
            </NavLink>
          </nav>
        )}
      </ResponsiveSidebar>
      <button type="button">Page button</button>
    </MemoryRouter>,
  );
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("ResponsiveSidebar on a wide screen", () => {
  beforeEach(() => setNarrow(false));

  it("shows the nav as a normal column with no menu button", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: "Transactions" })).toBeVisible();
    expect(screen.getByText("Header bit")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open menu" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ResponsiveSidebar on a narrow screen", () => {
  beforeEach(() => setNarrow(true));

  it("keeps the closed menu's links out of reach", async () => {
    const user = userEvent.setup();
    renderSidebar();

    expect(screen.queryByRole("link", { name: "Transactions" })).not.toBeInTheDocument();
    expect(screen.queryByText("Header bit")).not.toBeInTheDocument();

    // Tabbing from the top goes from the menu button straight to the page.
    await user.tab();
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Page button" })).toHaveFocus();
  });

  it("moves focus into the open menu and gives it back on Escape", async () => {
    const user = userEvent.setup();
    renderSidebar();
    const opener = screen.getByRole("button", { name: "Open menu" });

    await user.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "MyBookkeeper" });
    expect(dialog).toContainElement(screen.getByRole("link", { name: "Transactions" }));
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("closes and returns focus when a link is followed", async () => {
    const user = userEvent.setup();
    renderSidebar();
    const opener = screen.getByRole("button", { name: "Open menu" });

    await user.click(opener);
    await user.click(await screen.findByRole("link", { name: "Documents" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("closes from its close button", async () => {
    const user = userEvent.setup();
    renderSidebar();
    const opener = screen.getByRole("button", { name: "Open menu" });

    await user.click(opener);
    await user.click(await screen.findByRole("button", { name: "Close menu" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
