import { afterEach, describe, expect, it, vi } from "vitest";
import { replyRequestIdStore } from "@/shared/lib/reply-request-id-store";

describe("replyRequestIdStore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("keeps an id in session storage until it's spent", () => {
    replyRequestIdStore.set("i1:abc", "req-1");
    expect(sessionStorage.getItem("mbk.replyRequestId.i1:abc")).toBe("req-1");
    expect(replyRequestIdStore.get("i1:abc")).toBe("req-1");
    replyRequestIdStore.delete("i1:abc");
    expect(replyRequestIdStore.get("i1:abc")).toBeNull();
  });

  it("drops one inquiry's ids together, and only that inquiry's", () => {
    replyRequestIdStore.set("i1:abc", "req-1");
    replyRequestIdStore.set("i1:mightHaveSent", "true");
    replyRequestIdStore.set("i10:abc", "req-2");
    sessionStorage.setItem("other.i1:abc", "unrelated");
    replyRequestIdStore.deleteStartingWith("i1:");
    expect(replyRequestIdStore.get("i1:abc")).toBeNull();
    expect(replyRequestIdStore.get("i1:mightHaveSent")).toBeNull();
    expect(replyRequestIdStore.get("i10:abc")).toBe("req-2");
    expect(sessionStorage.getItem("other.i1:abc")).toBe("unrelated");
  });

  it("still keeps the id for this page when the browser refuses session storage", () => {
    const refuse = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(refuse);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(refuse);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(refuse);
    replyRequestIdStore.set("i2:abc", "req-2");
    expect(replyRequestIdStore.get("i2:abc")).toBe("req-2");
    replyRequestIdStore.delete("i2:abc");
    expect(replyRequestIdStore.get("i2:abc")).toBeNull();
    replyRequestIdStore.set("i2:def", "req-3");
    replyRequestIdStore.deleteStartingWith("i2:");
    expect(replyRequestIdStore.get("i2:def")).toBeNull();
  });
});
