import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { useGuildTab } from "@/games/wow-forever/hooks/useGuildTab";

function Probe() {
  const [tab, setTab] = useGuildTab();
  const { search } = useLocation();
  return (
    <>
      <span data-testid="tab">{tab}</span>
      <span data-testid="search">{search}</span>
      <button type="button" onClick={() => setTab("titles")}>titles</button>
    </>
  );
}

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: "/guild", element: <Probe /> }, { path: "/", element: <span>home</span> }], {
    initialEntries: ["/", path],
    initialIndex: 1,
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("useGuildTab", () => {
  it("names a tab an older link only implies, in place (Back still leaves the page)", async () => {
    const router = renderAt("/guild?recipe=linen");
    expect(screen.getByTestId("tab")).toHaveTextContent("crafting");
    expect(screen.getByTestId("search")).toHaveTextContent("?recipe=linen&tab=crafting");
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/");
  });

  it.each(["week", "arena"])("a retired ?tab=%s link opens Home and drops the param in place", (old) => {
    renderAt(`/guild?tab=${old}&me=tiny`);
    expect(screen.getByTestId("tab")).toHaveTextContent("home");
    expect(screen.getByTestId("search")).toHaveTextContent("?me=tiny");
  });

  it("a ?board= link is on Home already, with nothing written in", () => {
    renderAt("/guild?board=exalted");
    expect(screen.getByTestId("tab")).toHaveTextContent("home");
    expect(screen.getByTestId("search")).toHaveTextContent("?board=exalted");
  });

  it("picking a tab replaces the history entry", async () => {
    const router = renderAt("/guild");
    expect(screen.getByTestId("search")).toBeEmptyDOMElement();
    act(() => screen.getByRole("button", { name: "titles" }).click());
    expect(screen.getByTestId("search")).toHaveTextContent("?tab=titles");
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/");
  });
});
