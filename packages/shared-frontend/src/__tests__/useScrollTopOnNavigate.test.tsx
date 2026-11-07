import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate, type NavigateFunction } from "react-router-dom";
import { useScrollTopOnNavigate } from "../hooks/useScrollTopOnNavigate";

let navigate: NavigateFunction = () => undefined;

function Scroller() {
  const ref = useScrollTopOnNavigate<HTMLDivElement>();
  navigate = useNavigate();
  return <div ref={ref} data-testid="scroller" />;
}

function renderScroller() {
  render(
    <MemoryRouter initialEntries={["/a"]}>
      <Scroller />
    </MemoryRouter>,
  );
  return screen.getByTestId("scroller");
}

describe("useScrollTopOnNavigate", () => {
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
});
