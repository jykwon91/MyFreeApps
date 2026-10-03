import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takePlannerToken } from "@/games/wow-forever/hooks/usePlannerToken";

const TOKEN = "test-planner-token".padEnd(43, "x");

/** Each test its own raid: a token the module keeps in memory outlives the test. */
function planPath(webId: string): string {
  return `/wow-forever/raids/${webId}/plan`;
}

function blockStorage(): void {
  const blocked = (): never => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
}

describe("the planner link's token", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("moves from the link's fragment into this tab's keeping, out of the address bar", () => {
    window.history.replaceState(null, "", `${planPath("a1")}?from=discord#k=${TOKEN}`);
    expect(takePlannerToken("a1")).toBe(TOKEN);
    expect(window.location.hash).toBe("");
    expect(window.location.pathname + window.location.search).toBe(`${planPath("a1")}?from=discord`);
    expect(sessionStorage.getItem("mga.raidPlanner.a1")).toBe(TOKEN);
    // A reload of the tab finds it again.
    expect(takePlannerToken("a1")).toBe(TOKEN);
  });

  it("is ignored when it isn't one, though it still leaves the address bar", () => {
    window.history.replaceState(null, "", `${planPath("a2")}#k=not-a-token`);
    expect(takePlannerToken("a2")).toBeNull();
    expect(window.location.hash).toBe("");
    expect(sessionStorage.getItem("mga.raidPlanner.a2")).toBeNull();
  });

  it("belongs to its own raid", () => {
    sessionStorage.setItem("mga.raidPlanner.a3", TOKEN);
    expect(takePlannerToken("a3")).toBe(TOKEN);
    expect(takePlannerToken("a4")).toBeNull();
  });

  it("is never read back from storage when it isn't one", () => {
    sessionStorage.setItem("mga.raidPlanner.a5", "tampered");
    expect(takePlannerToken("a5")).toBeNull();
  });

  it("stays in memory when the browser blocks storage (a Discord Activity's iframe)", () => {
    blockStorage();
    window.history.replaceState(null, "", `${planPath("a6")}#k=${TOKEN}`);
    expect(takePlannerToken("a6")).toBe(TOKEN);
    expect(takePlannerToken("a6")).toBe(TOKEN);
    expect(takePlannerToken("a7")).toBeNull();
  });
});
