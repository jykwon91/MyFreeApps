import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adoptUnownedOrgId,
  forgetActiveOrgId,
  forgetOtherUsersOrgId,
  hasOtherUsersOrgId,
  persistActiveOrgId,
  readActiveOrgId,
} from "@/shared/lib/activeOrganizationStorage";

const ORG_KEY = "v1_activeOrgId";
const OWNER_KEY = "v1_activeOrgOwner";

function jwtFor(sub: string): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub, exp: Math.floor((Date.now() + 300_000) / 1000) }));
  return `${header}.${payload}.signature`;
}

function signInAs(sub: string): void {
  localStorage.setItem("token", jwtFor(sub));
}

describe("activeOrganizationStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("persistActiveOrgId", () => {
    it("writes the choice with the signed-in user as its owner", () => {
      signInAs("user-a");
      persistActiveOrgId("org-1");
      expect(localStorage.getItem(ORG_KEY)).toBe("org-1");
      expect(localStorage.getItem(OWNER_KEY)).toBe("user-a");
    });

    it("writes no owner when no one is signed in, and clears a stale one", () => {
      localStorage.setItem(OWNER_KEY, "user-a");
      persistActiveOrgId("org-1");
      expect(localStorage.getItem(ORG_KEY)).toBe("org-1");
      expect(localStorage.getItem(OWNER_KEY)).toBeNull();
    });

    it("clears the choice and its owner for null", () => {
      signInAs("user-a");
      persistActiveOrgId("org-1");
      persistActiveOrgId(null);
      expect(localStorage.getItem(ORG_KEY)).toBeNull();
      expect(localStorage.getItem(OWNER_KEY)).toBeNull();
    });
  });

  describe("hasOtherUsersOrgId and forgetOtherUsersOrgId", () => {
    it("is false with nothing stored", () => {
      signInAs("user-a");
      expect(hasOtherUsersOrgId()).toBe(false);
    });

    it("is true when signed out with a choice stored, but forgetting leaves it for a 401", () => {
      localStorage.setItem(ORG_KEY, "org-1");
      localStorage.setItem(OWNER_KEY, "user-a");
      expect(hasOtherUsersOrgId()).toBe(true);
      forgetOtherUsersOrgId();
      expect(localStorage.getItem(ORG_KEY)).toBe("org-1");
    });

    it("forgets a choice another user made once someone is signed in", () => {
      localStorage.setItem(ORG_KEY, "org-1");
      localStorage.setItem(OWNER_KEY, "user-a");
      signInAs("user-b");
      forgetOtherUsersOrgId();
      expect(localStorage.getItem(ORG_KEY)).toBeNull();
      expect(localStorage.getItem(OWNER_KEY)).toBeNull();
    });

    it("keeps the signed-in user's own choice", () => {
      localStorage.setItem(ORG_KEY, "org-1");
      localStorage.setItem(OWNER_KEY, "user-a");
      signInAs("user-a");
      forgetOtherUsersOrgId();
      expect(localStorage.getItem(ORG_KEY)).toBe("org-1");
    });
  });

  describe("adoptUnownedOrgId", () => {
    it("gives a legacy choice to the user signed in at load", () => {
      localStorage.setItem(ORG_KEY, "org-legacy");
      signInAs("user-a");
      adoptUnownedOrgId();
      expect(localStorage.getItem(OWNER_KEY)).toBe("user-a");
      forgetOtherUsersOrgId();
      expect(localStorage.getItem(ORG_KEY)).toBe("org-legacy");
    });

    it("leaves a legacy choice unowned when no one is signed in", () => {
      localStorage.setItem(ORG_KEY, "org-legacy");
      adoptUnownedOrgId();
      expect(localStorage.getItem(OWNER_KEY)).toBeNull();
    });

    it("does not take over a choice that already has an owner", () => {
      localStorage.setItem(ORG_KEY, "org-1");
      localStorage.setItem(OWNER_KEY, "user-a");
      signInAs("user-b");
      adoptUnownedOrgId();
      expect(localStorage.getItem(OWNER_KEY)).toBe("user-a");
    });
  });

  describe("blocked storage", () => {
    it("reads as nothing and never throws", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("blocked");
      });

      expect(readActiveOrgId()).toBeNull();
      expect(hasOtherUsersOrgId()).toBe(false);
      expect(() => {
        persistActiveOrgId("org-1");
        forgetActiveOrgId();
        forgetOtherUsersOrgId();
        adoptUnownedOrgId();
      }).not.toThrow();
    });
  });
});
