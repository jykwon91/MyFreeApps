import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { BrowserRouter, MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { useLiveSearchParams } from "../hooks/useLiveSearchParams";

function BrowserWrapper({ children }: { children: ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

function useHarness() {
  const [params, setParams] = useLiveSearchParams();
  return { params, setParams, location: useLocation(), navigate: useNavigate() };
}

/** Two hooks writing the same URL, as the World Map's trip and map view do. */
function useTwoWriters() {
  const [, setTrip] = useLiveSearchParams();
  const [params, setMap] = useLiveSearchParams();
  return { params, setTrip, setMap };
}

function withParam(key: string, value: string) {
  return (prev: URLSearchParams) => {
    const next = new URLSearchParams(prev);
    next.set(key, value);
    return next;
  };
}

describe("useLiveSearchParams", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("keeps both of two changes made before the first one renders", () => {
    window.history.replaceState(null, "", "/board?sort=new");
    const { result } = renderHook(useHarness, { wrapper: BrowserWrapper });
    act(() => {
      result.current.setParams(withParam("status", "not_planned"));
      result.current.setParams(withParam("area", "pvp"));
    });
    expect(result.current.params.toString()).toBe("sort=new&status=not_planned&area=pvp");
    expect(result.current.location.pathname).toBe("/board");
  });

  it("keeps a change another hook made just before", () => {
    window.history.replaceState(null, "", "/map");
    const { result } = renderHook(useTwoWriters, { wrapper: BrowserWrapper });
    act(() => {
      result.current.setTrip(withParam("dir", "1"));
      result.current.setMap(withParam("m", "1453"));
    });
    expect(result.current.params.toString()).toBe("dir=1&m=1453");
  });

  it("starts from where Back landed", async () => {
    window.history.replaceState(null, "", "/board?status=shipped");
    const { result } = renderHook(useHarness, { wrapper: BrowserWrapper });
    act(() => result.current.setParams(withParam("area", "pvp")));
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
    });
    expect(result.current.location.search).toBe("?status=shipped");
    act(() => result.current.setParams(withParam("sort", "new")));
    expect(result.current.params.toString()).toBe("status=shipped&sort=new");
  });

  it("with a router that doesn't drive the address bar, builds on the committed query", () => {
    const { result } = renderHook(useHarness, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={["/board?status=shipped"]}>{children}</MemoryRouter>
      ),
    });
    act(() => result.current.setParams(withParam("area", "pvp")));
    expect(result.current.params.toString()).toBe("status=shipped&area=pvp");
  });
});
