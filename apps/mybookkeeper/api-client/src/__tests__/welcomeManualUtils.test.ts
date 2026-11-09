import { describe, expect, it } from "vitest";
import { SHARED_ROOM_OPTION } from "../constants/welcomeManualLimits";
import { dirtyFlags, hasDirtyFlags } from "../utils/welcomeManualDirty";
import { validateSectionImages } from "../utils/welcomeManualImageValidation";
import {
  emailProblems,
  fieldProblems,
  hasProblems,
  manualCreateProblems,
  placeProblems,
  roomNameProblem,
  sectionProblems,
} from "../utils/welcomeManualProblems";
import { cuisineSuggestions, filterPlaces, groupPlacesByCuisine, NO_PLACE_FILTERS, placeCuisines, placePriceTiers } from "../utils/welcomeManualPlaces";
import { moveItem, sameOrder } from "../utils/welcomeManualReorder";
import {
  emailRequest,
  fieldCreateRequest,
  fieldUpdateRequest,
  manualCreateRequest,
  manualUpdateRequest,
  placeCreateRequest,
  placeUpdateRequest,
  sectionFormCreateRequest,
  sectionFormUpdateRequest,
  sectionUpdateRequest,
} from "../utils/welcomeManualRequests";
import { sectionsForScope } from "../utils/welcomeManualScope";
import { shareUrl } from "../utils/welcomeManualShare";
import { SECTION_IMAGE_MAX_BYTES } from "../constants/welcomeManualLimits";
import type { WelcomeManualPlaceFormValues } from "../types/welcome-manual/welcome-manual-place-form-values";
import type { WelcomeManualSectionResponse } from "../types/welcome-manual/welcome-manual-section-response";

const place: WelcomeManualPlaceFormValues = { name: "Cafe", cuisine: "Thai", price_tier: "$$", note: "", map_url: "" };

describe("dirty flags", () => {
  it("flags only the changed keys", () => {
    const flags = dirtyFlags({ a: "1", b: "2" }, { a: "1", b: "3" });
    expect(flags).toEqual({ b: true });
    expect(hasDirtyFlags(flags)).toBe(true);
    expect(hasDirtyFlags(dirtyFlags({ a: "1" }, { a: "1" }))).toBe(false);
  });
});

describe("requests", () => {
  it("trims on create and maps blanks to null", () => {
    expect(manualCreateRequest({ title: " Hi ", property_id: "", seed_default_sections: true })).toEqual({
      title: "Hi",
      property_id: null,
      seed_default_sections: true,
    });
    expect(sectionFormCreateRequest({ title: " T ", body: "  ", room_id: "" })).toEqual({ title: "T", body: null, room_id: null });
    expect(fieldCreateRequest({ label: " L ", value: "" })).toEqual({ label: "L", value: null });
    expect(placeCreateRequest({ ...place, price_tier: "", note: " n " })).toEqual({
      name: "Cafe",
      cuisine: "Thai",
      price_tier: null,
      note: "n",
      map_url: null,
    });
  });

  it("sends only dirty fields on update", () => {
    const values = { title: "New", intro_text: "", property_id: "p" };
    expect(manualUpdateRequest(values, { title: true, intro_text: true })).toEqual({ title: "New", intro_text: null });
    expect(sectionUpdateRequest({ title: "t", body: "b" }, { body: true })).toEqual({ body: "b" });
    expect(sectionFormUpdateRequest({ title: "t", body: "b", room_id: "" }, { room_id: true })).toEqual({ room_id: null });
    expect(fieldUpdateRequest({ label: "l", value: "" }, { value: true })).toEqual({ value: null });
    expect(placeUpdateRequest({ ...place, price_tier: "" }, { price_tier: true })).toEqual({ price_tier: null });
    expect(manualUpdateRequest(values, {})).toEqual({});
  });
});

describe("problems", () => {
  it("requires a title and caps its length", () => {
    expect(manualCreateProblems({ title: " ", property_id: "", seed_default_sections: true }).title).toBeDefined();
    expect(sectionProblems({ title: "x".repeat(201), body: "", room_id: "" }).title).toBeDefined();
    expect(hasProblems(sectionProblems({ title: "ok", body: "", room_id: "" }))).toBe(false);
  });

  it("checks field and place limits and the map link scheme", () => {
    expect(fieldProblems({ label: "", value: "" }).label).toBeDefined();
    expect(fieldProblems({ label: "l", value: "v".repeat(501) }).value).toBeDefined();
    expect(placeProblems({ ...place, map_url: "ftp://x" }).map_url).toBeDefined();
    expect(placeProblems({ ...place, map_url: "https://maps.example/x" }).map_url).toBeUndefined();
    expect(placeProblems({ ...place, cuisine: "" }).cuisine).toBeDefined();
    expect(roomNameProblem("")).toBeDefined();
    expect(roomNameProblem("Den")).toBeUndefined();
  });

  it("validates the email form, needing a room only when there are rooms", () => {
    expect(emailProblems({ recipient_email: "nope", recipient_name: "", room_id: "" }, false).recipient_email).toBeDefined();
    expect(emailProblems({ recipient_email: "a@b.co", recipient_name: "", room_id: "" }, true).room_id).toBeDefined();
    expect(hasProblems(emailProblems({ recipient_email: "a@b.co", recipient_name: "", room_id: "" }, false))).toBe(false);
  });
});

describe("image validation", () => {
  it("rejects oversized and unsupported files and keeps the rest", () => {
    const result = validateSectionImages([
      { name: "big.jpg", size: SECTION_IMAGE_MAX_BYTES + 1, type: "image/jpeg" },
      { name: "doc.pdf", size: 10, type: "application/pdf" },
      { name: "pic.HEIC", size: 10, type: "" },
      { name: "ok.png", size: 10, type: "image/png" },
    ]);
    expect(result.valid.map((f) => f.name)).toEqual(["pic.HEIC", "ok.png"]);
    expect(result.rejected).toEqual(["big.jpg is over 10MB", "doc.pdf is not a supported image type"]);
  });
});

describe("reorder", () => {
  it("moves an item and ignores out-of-range moves", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
  });
});

describe("scope and share", () => {
  const sections = [
    { id: "1", room_id: null },
    { id: "2", room_id: "r1" },
    { id: "3", room_id: "r2" },
  ] as WelcomeManualSectionResponse[];

  it("shows shared sections plus the chosen room's", () => {
    expect(sectionsForScope(sections, "shared").map((s) => s.id)).toEqual(["1"]);
    expect(sectionsForScope(sections, "r1").map((s) => s.id)).toEqual(["1", "2"]);
  });

  it("puts the token on the guide path of the site, with one slash", () => {
    expect(shareUrl("https://x.test/", "abc")).toBe("https://x.test/guide/abc");
    expect(shareUrl("https://x.test", "abc")).toBe("https://x.test/guide/abc");
  });
});

describe("the places directory", () => {
  const place = (id: string, name: string, cuisine: string, price_tier: "$" | "$$" | "$$$" | null = null, note: string | null = null) => ({
    id, manual_id: "m", name, cuisine, price_tier, note, map_url: null, display_order: 0, created_at: "",
  });
  const places = [place("1", "Taco Hut", "Mexican", "$", "Great al pastor"), place("2", "Bella", "Italian", "$$$"), place("3", "Casa", "Mexican", "$$")];

  it("lists each cuisine once, in order", () => {
    expect(placeCuisines(places)).toEqual(["Italian", "Mexican"]);
  });

  it("lists only the price tiers in use, cheapest first", () => {
    expect(placePriceTiers(places)).toEqual(["$", "$$", "$$$"]);
    expect(placePriceTiers([places[1]])).toEqual(["$$$"]);
  });

  it("searches name, cuisine and note, ignoring case", () => {
    const ids = (search: string) => filterPlaces(places, { ...NO_PLACE_FILTERS, search }).map((p) => p.id);
    expect(ids("TACO")).toEqual(["1"]);
    expect(ids("italian")).toEqual(["2"]);
    expect(ids("pastor")).toEqual(["1"]);
    expect(ids("  ")).toEqual(["1", "2", "3"]);
  });

  it("narrows by cuisine and price tier together", () => {
    expect(filterPlaces(places, { search: "", cuisine: "Mexican", priceTier: "$$" }).map((p) => p.id)).toEqual(["3"]);
    expect(filterPlaces(places, { search: "", cuisine: "Italian", priceTier: "$" })).toEqual([]);
  });

  it("groups by cuisine in order", () => {
    expect(groupPlacesByCuisine(places).map((group) => [group.cuisine, group.places.map((p) => p.id)])).toEqual([["Italian", ["2"]], ["Mexican", ["1", "3"]]]);
  });

  it("suggests cuisines already used while typing, but not one already typed in full", () => {
    expect(cuisineSuggestions(places, "ita")).toEqual(["Italian"]);
    expect(cuisineSuggestions(places, "ITALIAN")).toEqual([]);
    expect(cuisineSuggestions(places, "")).toEqual(["Italian", "Mexican"]);
    expect(cuisineSuggestions(places, "zzz")).toEqual([]);
  });
});

describe("the email request", () => {
  const values = { recipient_email: " guest@example.com ", recipient_name: " ", room_id: "" };

  it("sends the shared-sections choice as no room at all", () => {
    expect(emailRequest({ ...values, room_id: SHARED_ROOM_OPTION }).room_id).toBeNull();
  });

  it("sends a chosen room as that room, and trims the rest", () => {
    expect(emailRequest({ ...values, room_id: "r1" })).toEqual({ recipient_email: "guest@example.com", recipient_name: null, room_id: "r1" });
  });

  it("sends no room when none was chosen", () => {
    expect(emailRequest(values).room_id).toBeNull();
  });
});
