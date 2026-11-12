import { beforeEach, describe, expect, it, vi } from "vitest";
import { RESUME_SESSION_STORAGE_KEY } from "@/constants/resume-session-storage";

// Only the network is faked: the real auth client runs, so this proves the wiring, not a mock of it.
vi.mock("@platform/core/lib/api", () => ({
  default: { post: vi.fn() },
}));

import api from "@platform/core/lib/api";
import { notifyAuthChange } from "@platform/core/lib/auth-store";
import { getPlatform } from "@platform/core/platform/configurePlatform";
import { signIn, signOut } from "@/lib/auth";
import { storeResumeSession } from "@/lib/resumeSessionStorage";

const post = vi.mocked(api.post);

/** A token for `sub`; each sign-in issues a fresh one, so two for the same person differ. */
function jwtFor(sub: string, issuedAt: number): string {
  const payload = btoa(JSON.stringify({ sub, iat: issuedAt, exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `header.${payload}.signature`;
}

async function signedInAs(sub: string, issuedAt: number): Promise<void> {
  post.mockResolvedValueOnce({ data: { access_token: jwtFor(sub, issuedAt), token_type: "bearer" } });
  await signIn(`${sub}@example.com`, "password");
}

/** What the API client does when the token is rejected and the refresh is refused. */
function sessionExpires(): void {
  getPlatform().tokenStore.clear();
  notifyAuthChange();
}

describe("the refinement session /resume reopens, across accounts", () => {
  beforeEach(async () => {
    post.mockReset();
    signOut();
    localStorage.clear();
    await signedInAs("user-a", 1);
    storeResumeSession("rs-a");
  });

  it("is forgotten on sign-out", () => {
    signOut();

    expect(localStorage.getItem(RESUME_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("is forgotten when someone else signs in in the same tab", async () => {
    await signedInAs("user-b", 2);

    expect(localStorage.getItem(RESUME_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("is kept through an expired session when the same person signs back in", async () => {
    sessionExpires();
    expect(localStorage.getItem(RESUME_SESSION_STORAGE_KEY)).toBe("rs-a");

    await signedInAs("user-a", 2);

    expect(localStorage.getItem(RESUME_SESSION_STORAGE_KEY)).toBe("rs-a");
  });

  it("is forgotten when someone else signs in after the session expired", async () => {
    sessionExpires();

    await signedInAs("user-b", 2);

    expect(localStorage.getItem(RESUME_SESSION_STORAGE_KEY)).toBeNull();
  });
});
