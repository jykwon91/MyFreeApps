import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate, type NavigateFunction } from "react-router-dom";
import { useScrollTopOnNavigate } from "../hooks/useScrollTopOnNavigate";

let navigate: NavigateFunction = () => undefined;

function Scroller({ resetWindow = false }: { resetWindow?: boolean }) {
  const ref = useScrollTopOnNavigate<HTMLDivElement>({ resetWindow });
  const routerNavigate = useNavigate();
  useEffect(() => {
    navigate = routerNavigate;
  }, [routerNavigate]);
  return <div ref={ref} data-testid="scroller" />;
}

function renderScroller(resetWindow = false) {
  render(
    <MemoryRouter initialEntries={["/a"]}>
      <Scroller resetWindow={resetWindow} />
    </MemoryRouter>,
  );
  return screen.getByTestId("scroller");
}

describe("useScrollTopOnNavigate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("puts the container back at the top on a new path", () => {
    const scroller = renderScroller();
    scroller.scrollTop = 400;
    act(() => navigate("/b"));
    expect(scroller.scrollTop).toBe(0);
  });

  it("keeps the scroll when only the query changes", () => {
    const scroller = renderScroller();
    scroller.scrollTop = 400;
    act(() => navigate("/a?class=warlock"));
    expect(scroller.scrollTop).toBe(400);
  });

  it("leaves the window alone unless asked", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    renderScroller();
    act(() => navigate("/b"));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("with resetWindow, also puts the window back at the top on a new path, for a page the window scrolls", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const scroller = renderScroller(true);
    scrollTo.mockClear();
    scroller.scrollTop = 400;

    act(() => navigate("/b"));

    expect(scroller.scrollTop).toBe(0);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    scrollTo.mockClear();
    act(() => navigate("/b?tab=2"));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
