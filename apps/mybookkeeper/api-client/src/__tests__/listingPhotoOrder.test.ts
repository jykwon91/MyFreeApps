import { describe, expect, it } from "vitest";
import type { ListingPhoto } from "../types/listing/listing-photo";
import { hasSameIds, moveId, sortPhotos } from "../utils/listingPhotoOrder";

const photo = (id: string, display_order: number) => ({ id, display_order }) as ListingPhoto;

describe("sortPhotos", () => {
  it("puts the lowest display order first without changing the input", () => {
    const input = [photo("b", 2), photo("a", 0), photo("c", 1)];
    expect(sortPhotos(input).map((p) => p.id)).toEqual(["a", "c", "b"]);
    expect(input.map((p) => p.id)).toEqual(["b", "a", "c"]);
  });
});

describe("moveId", () => {
  it("moves an id to a new place", () => {
    expect(moveId(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveId(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });
  it("leaves the order alone for a no-op or out-of-range move", () => {
    expect(moveId(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(moveId(["a", "b"], 0, 2)).toEqual(["a", "b"]);
    expect(moveId(["a", "b"], -1, 0)).toEqual(["a", "b"]);
  });
});

describe("hasSameIds", () => {
  it("is true for the same ids in any order", () => {
    expect(hasSameIds(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
  });
  it("is false for a missing, extra or repeated id", () => {
    expect(hasSameIds(["a", "b"], ["a", "b", "c"])).toBe(false);
    expect(hasSameIds(["a", "b", "c"], ["a", "b"])).toBe(false);
    expect(hasSameIds(["a", "a"], ["a", "b"])).toBe(false);
  });
});
