import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useResetDocumentTitle } from "@/hooks/useResetDocumentTitle";

describe("useResetDocumentTitle", () => {
  it("replaces a route page's served title on every navigation", () => {
    document.title = "World Map · WoW Forever";
    const { rerender } = renderHook(({ pathname }) => useResetDocumentTitle(pathname, "MyGamingAssistant"), {
      initialProps: { pathname: "/wow-forever/map" },
    });
    expect(document.title).toBe("MyGamingAssistant");

    document.title = "Rares · WoW Forever";
    rerender({ pathname: "/cs2" });
    expect(document.title).toBe("MyGamingAssistant");
  });

  it("leaves a page's own title alone until the route changes", () => {
    const { rerender } = renderHook(({ pathname }) => useResetDocumentTitle(pathname, "MyGamingAssistant"), {
      initialProps: { pathname: "/wow-forever/raids" },
    });
    document.title = "Raid planner";
    rerender({ pathname: "/wow-forever/raids" });
    expect(document.title).toBe("Raid planner");
  });
});
