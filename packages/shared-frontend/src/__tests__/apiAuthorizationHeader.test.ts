/**
 * The shared API client's `Authorization` header: the signed-in user's `Bearer` token on every request — except one
 * that names its own scheme (MyGamingAssistant's raid planner sends `RaidPlanner <token>`), which keeps it.
 */
import type { InternalAxiosRequestConfig } from "axios";
import { beforeEach, describe, expect, it } from "vitest";
import api from "../lib/api";

/** The request as it leaves, after the client's interceptors. */
async function sent(headers: Record<string, string> = {}): Promise<InternalAxiosRequestConfig> {
  const seen: InternalAxiosRequestConfig[] = [];
  await api.get("/wow/raids/abc/plan", {
    headers,
    adapter: async (config) => {
      seen.push(config);
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    },
  });
  return seen[0];
}

describe("the shared API client's Authorization header", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("carries the signed-in user's token", async () => {
    localStorage.setItem("token", "jwt-123");
    expect((await sent()).headers.Authorization).toBe("Bearer jwt-123");
  });

  it("keeps a request's own Authorization, though someone is signed in", async () => {
    localStorage.setItem("token", "jwt-123");
    expect((await sent({ Authorization: "RaidPlanner abc" })).headers.Authorization).toBe("RaidPlanner abc");
  });

  it("keeps a request's own Authorization with nobody signed in", async () => {
    expect((await sent({ Authorization: "RaidPlanner abc" })).headers.Authorization).toBe("RaidPlanner abc");
  });

  it("sends none with nobody signed in", async () => {
    expect((await sent()).headers.Authorization).toBeUndefined();
  });
});
