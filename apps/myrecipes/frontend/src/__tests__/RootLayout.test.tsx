import { beforeAll, describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import RootLayout from "@/RootLayout";

let authenticated = true;

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, useIsAuthenticated: () => authenticated };
});
vi.mock("@platform/ui/store/userApi", () => ({
  useGetCurrentUserQuery: () => ({ data: { email: "cook@example.com", display_name: "Cook" } }),
}));
vi.mock("@/hooks/useIsSuperuser", () => ({ useIsSuperuser: () => ({ isSuperuser: false }) }));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));

function renderLayout() {
  const router = createMemoryRouter(
    [
      {
        element: <RootLayout />,
        children: [
          { path: "/", element: <div>Home page</div> },
          { path: "/support-myfreeapps", element: <div>Support page</div> },
        ],
      },
    ],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

function supportLinks(): HTMLElement[] {
  return screen.queryAllByRole("link", { name: /support myfreeapps/i });
}

describe("RootLayout navigation", () => {
  it("shows Support to a signed-in user and opens the support page", async () => {
    authenticated = true;
    renderLayout();
    const links = supportLinks();
    expect(links.length).toBeGreaterThan(0);
    await userEvent.setup().click(links[0]);
    expect(await screen.findByText("Support page")).toBeInTheDocument();
  });

  it("does not add Support to the guest navigation", () => {
    authenticated = false;
    renderLayout();
    expect(supportLinks()).toHaveLength(0);
    expect(within(document.body).getByText("Home page")).toBeInTheDocument();
  });
});
