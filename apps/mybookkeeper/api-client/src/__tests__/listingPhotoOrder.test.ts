import { describe, expect, it } from "vitest";
import type { ListingPhoto } from "../types/listing/listing-photo";
import { moveId, photoOrderChanges, sortPhotos } from "../utils/listingPhotoOrder";

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

describe("photoOrderChanges", () => {
  it("lists only the photos whose position moved", () => {
    const photos = [photo("a", 0), photo("b", 1), photo("c", 2)];
    expect(photoOrderChanges(["c", "a", "b"], photos)).toEqual([
      { photoId: "c", displayOrder: 0 },
      { photoId: "a", displayOrder: 1 },
      { photoId: "b", displayOrder: 2 },
    ]);
    expect(photoOrderChanges(["a", "c", "b"], photos)).toEqual([
      { photoId: "c", displayOrder: 1 },
      { photoId: "b", displayOrder: 2 },
    ]);
    expect(photoOrderChanges(["a", "b", "c"], photos)).toEqual([]);
  });
  it("ignores ids that are not photos", () => {
    expect(photoOrderChanges(["x"], [photo("a", 0)])).toEqual([]);
  });
});
