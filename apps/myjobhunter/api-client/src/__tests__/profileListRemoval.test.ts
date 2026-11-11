import { describe, expect, it } from "vitest";
import { isConflict } from "../utils/isConflict";
import { removalIsDone } from "../utils/removalIsDone";
import { withoutListItem } from "../utils/withoutListItem";

describe("withoutListItem", () => {
  const list = { items: [{ id: "a" }, { id: "b" }], total: 2 };

  it("takes the record out and lowers the total", () => {
    expect(withoutListItem(list, "a")).toEqual({ items: [{ id: "b" }], total: 1 });
  });

  it("leaves the list as it was when the record isn't in it", () => {
    expect(withoutListItem(list, "z")).toBe(list);
  });
});

describe("removalIsDone", () => {
  it("is done when the delete succeeds, or when the record was already gone", async () => {
    await expect(removalIsDone(Promise.resolve({ data: undefined }))).resolves.toBe(true);
    await expect(removalIsDone(Promise.reject({ error: { status: 404, data: { detail: "Not found" } } }))).resolves.toBe(true);
  });

  it("isn't done when the delete fails any other way", async () => {
    await expect(removalIsDone(Promise.reject({ error: { status: 500 } }))).resolves.toBe(false);
    await expect(removalIsDone(Promise.reject(new Error("offline")))).resolves.toBe(false);
  });
});

describe("isConflict", () => {
  it("is true only for a 409", () => {
    expect(isConflict({ status: 409, data: { detail: "Skill already exists" } })).toBe(true);
    expect(isConflict({ status: 404 })).toBe(false);
    expect(isConflict(new Error("offline"))).toBe(false);
  });
});
