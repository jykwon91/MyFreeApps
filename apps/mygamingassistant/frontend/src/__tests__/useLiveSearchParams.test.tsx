import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useLiveSearchParams } from "@/games/wow-forever/hooks/useLiveSearchParams";

function wrapperAt(url: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  };
}

function useHarness() {
  const [params, setParams] = useLiveSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  return { params, setParams, location, navigate };
}

function withParam(key: string, value: string) {
  return (prev: URLSearchParams) => {
    const next = new URLSearchParams(prev);
    next.set(key, value);
    return next;
  };
}

describe("useLiveSearchParams", () => {
  it("keeps both of two changes made before the first one renders", () => {
    const { result } = renderHook(useHarness, { wrapper: wrapperAt("/board?sort=new") });
    act(() => {
      result.current.setParams(withParam("status", "not_planned"));
      result.current.setParams(withParam("area", "pvp"));
    });
    expect(result.current.params.get("status")).toBe("not_planned");
    expect(result.current.params.get("area")).toBe("pvp");
    expect(result.current.params.get("sort")).toBe("new");
    expect(result.current.location.pathname).toBe("/board");
  });

  it("starts from a navigation it didn't make, like Back", () => {
    const { result } = renderHook(useHarness, { wrapper: wrapperAt("/board?status=shipped") });
    act(() => result.current.setParams(withParam("area", "pvp")));
    act(() => {
      void result.current.navigate(-1);
    });
    expect(result.current.location.search).toBe("?status=shipped");
    act(() => result.current.setParams(withParam("sort", "new")));
    expect(result.current.params.toString()).toBe("status=shipped&sort=new");
  });
});
