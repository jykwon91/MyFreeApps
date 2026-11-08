import { act, render } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useResetDocumentTitle } from "@/hooks/useResetDocumentTitle";

function Layout() {
  useResetDocumentTitle(useLocation().pathname, "MyGamingAssistant");
  return <Outlet />;
}

function SharedPage() {
  useDocumentTitle("Races · WoW Forever");
  return null;
}

describe("useDocumentTitle", () => {
  it("keeps the page's title when the same page stays mounted across a route change", async () => {
    const router = createMemoryRouter(
      [{ element: <Layout />, children: [{ path: "/races", element: <SharedPage /> }, { path: "/races/:race", element: <SharedPage /> }] }],
      { initialEntries: ["/races"] },
    );
    render(<RouterProvider router={router} />);
    expect(document.title).toBe("Races · WoW Forever");

    await act(() => router.navigate("/races/human"));
    expect(document.title).toBe("Races · WoW Forever");
  });
});
