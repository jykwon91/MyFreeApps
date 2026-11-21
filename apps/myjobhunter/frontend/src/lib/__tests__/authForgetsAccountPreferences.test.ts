import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  KANBAN_LANE_STORAGE_PREFIX,
  PROFILE_BANNER_DISMISSED_STORAGE_KEY,
  RESUME_CLICK_TIP_DISMISSED_STORAGE_KEY,
  SECURITY_INTRO_DISMISSED_STORAGE_KEY,
} from "@/constants/account-preference-storage";

// Only the network is faked: the real auth client runs, so this proves the wiring, not a mock of it.
vi.mock("@platform/core/lib/api", () => ({
  default: { post: vi.fn() },
}));

import api from "@platform/core/lib/api";
import { notifyAuthChange } from "@platform/core/lib/auth-store";
import { getPlatform } from "@platform/core/platform/configurePlatform";
import { signIn, signOut } from "@/lib/auth";

const post = vi.mocked(api.post);
const LANE_KEY = `${KANBAN_LANE_STORAGE_PREFIX}strong_fit`;
const UNRELATED_KEY = "theme";

function jwtFor(sub: string, issuedAt: number): string {
  const payload = btoa(JSON.stringify({ sub, iat: issuedAt, exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `header.${payload}.signature`;
}

async function signedInAs(sub: string, issuedAt: number): Promise<void> {
  post.mockResolvedValueOnce({ data: { access_token: jwtFor(sub, issuedAt), token_type: "bearer" } });
  await signIn(`${sub}@example.com`, "password");
}

function accountDismissesAndFolds(): void {
  localStorage.setItem(PROFILE_BANNER_DISMISSED_STORAGE_KEY, "true");
  localStorage.setItem(SECURITY_INTRO_DISMISSED_STORAGE_KEY, "1");
  localStorage.setItem(RESUME_CLICK_TIP_DISMISSED_STORAGE_KEY, "1");
  localStorage.setItem(LANE_KEY, "true");
  localStorage.setItem(UNRELATED_KEY, "dark");
}

function expectAccountChoicesGone(): void {
  expect(localStorage.getItem(PROFILE_BANNER_DISMISSED_STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(SECURITY_INTRO_DISMISSED_STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(RESUME_CLICK_TIP_DISMISSED_STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(LANE_KEY)).toBeNull();
  expect(localStorage.getItem(UNRELATED_KEY)).toBe("dark");
}

describe("one account's dismissed reminders and folded lanes, across accounts", () => {
  beforeEach(async () => {
    post.mockReset();
    signOut();
    localStorage.clear();
    await signedInAs("user-a", 1);
    accountDismissesAndFolds();
  });

  it("are forgotten on sign-out", () => {
    signOut();

    expectAccountChoicesGone();
  });

  it("are forgotten when someone else signs in in the same tab", async () => {
    await signedInAs("user-b", 2);

    expectAccountChoicesGone();
  });

  it("are kept through an expired session when the same person signs back in", async () => {
    getPlatform().tokenStore.clear();
    notifyAuthChange();

    await signedInAs("user-a", 2);

    expect(localStorage.getItem(PROFILE_BANNER_DISMISSED_STORAGE_KEY)).toBe("true");
    expect(localStorage.getItem(LANE_KEY)).toBe("true");
  });
});
