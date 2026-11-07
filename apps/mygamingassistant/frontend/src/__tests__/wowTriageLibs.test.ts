/**
 * Triage screen pure libs: hidden-character reveal, the shipped-path check (pinned to the backend),
 * merge suggestions, and the copy a failed write shows.
 */
import featureStoryModelSource from "../../../backend/app/models/wow/feature_story.py?raw";
import triagePatchSchemaSource from "../../../backend/app/schemas/wow/feature_requests/triage_story_patch.py?raw";
import { describe, expect, it } from "vitest";
import { rankMergeCandidates, searchMergeTargets, mergeTargets } from "@/games/wow-forever/lib/featureRequests/triage/rankMergeCandidates";
import { hiddenCharMarker, revealHiddenChars } from "@/games/wow-forever/lib/featureRequests/triage/revealHiddenChars";
import {
  SHIPPED_PATH_CHECK_PATTERN,
  SHIPPED_PATH_SCHEMA_PATTERN,
  isValidShippedPath,
} from "@/games/wow-forever/lib/featureRequests/triage/shippedPathValidator";
import { triageErrorFrom } from "@/games/wow-forever/lib/featureRequests/triage/triageErrors";
import { triageErrorView } from "@/games/wow-forever/lib/featureRequests/triage/triageErrorView";
import { triageStory } from "./wowTriageFixtures";

describe("revealHiddenChars", () => {
  it("leaves ordinary text as one run", () => {
    expect(revealHiddenChars("Add a herb map")).toEqual({
      segments: [{ kind: "text", text: "Add a herb map" }],
      hasHidden: false,
    });
  });

  it("marks zero-width and direction-changing characters", () => {
    const { segments, hasHidden } = revealHiddenChars("abc‮def​g﻿");
    expect(hasHidden).toBe(true);
    expect(segments).toEqual([
      { kind: "text", text: "abc" },
      { kind: "hidden", codePoint: "U+202E" },
      { kind: "text", text: "def" },
      { kind: "hidden", codePoint: "U+200B" },
      { kind: "text", text: "g" },
      { kind: "hidden", codePoint: "U+FEFF" },
    ]);
  });

  it("covers every listed range", () => {
    for (const cp of [0x200b, 0x200f, 0x202a, 0x202e, 0x2060, 0x2066, 0x2069, 0x061c, 0xfeff]) {
      expect(revealHiddenChars(String.fromCodePoint(cp)).hasHidden).toBe(true);
    }
    expect(revealHiddenChars("‐ é 漢").hasHidden).toBe(false);
  });

  it("renders a marker", () => {
    expect(hiddenCharMarker("U+202E")).toBe("⟨U+202E⟩");
  });
});

describe("shipped path validator", () => {
  it("uses the PATCH schema's pattern character for character", () => {
    expect(triagePatchSchemaSource).toContain(`pattern=r"${SHIPPED_PATH_SCHEMA_PATTERN}"`);
  });

  it("uses the database CHECK's pattern", () => {
    // The Python source escapes the backslash once more.
    expect(featureStoryModelSource).toContain(`shipped_path ~ '${SHIPPED_PATH_CHECK_PATTERN.replace("\\", "\\\\")}'`);
  });

  it.each(["/wow-forever", "/wow-forever/", "/wow-forever/map", "/wow-forever/professions?skill=alchemy", "/wow-forever?tab=x"])(
    "accepts %s",
    (path) => expect(isValidShippedPath(path)).toBe(true),
  );

  it.each([
    "",
    "/wow-forevermore",
    "https://evil.example/wow-forever",
    "//evil.example/wow-forever",
    "/wow-forever/<script>",
    "/wow-forever/map#x",
    "/wow-forever/a b",
    "javascript:alert(1)",
    `/wow-forever/${"a".repeat(200)}`,
  ])("rejects %s", (path) => expect(isValidShippedPath(path)).toBe(false));
});

describe("rankMergeCandidates", () => {
  const source = triageStory(1, { title: "Herb farming map", i_want: "a map of herb spawns", area: "map_travel", status: "submitted" });
  const close = triageStory(2, { title: "Herb spawn map", i_want: "herb spawn spots on the map", area: "map_travel", vote_count: 3 });
  const otherArea = triageStory(3, { title: "Herb prices", i_want: "herb prices from the auction house", area: "gold_economy" });
  const unrelated = triageStory(4, { title: "Raid signups", i_want: "discord raid signups" });
  const hidden = triageStory(5, { title: "Herb spawn map again", i_want: "herb spawns map", hidden: true });
  const merged = triageStory(6, { title: "Herb spawn map dup", i_want: "herb spawns map", status: "duplicate" });
  const waiting = triageStory(7, { title: "Herb spawn map waiting", i_want: "herb spawns map", status: "submitted" });

  it("never offers itself, hidden, merged or unreviewed stories", () => {
    const ids = mergeTargets(source, [source, close, hidden, merged, waiting]).map((s) => s.id);
    expect(ids).toEqual([close.id]);
  });

  it("puts the closest same-area story first and drops unrelated ones", () => {
    const ranked = rankMergeCandidates(source, [unrelated, otherArea, close]);
    expect(ranked[0]?.story.id).toBe(close.id);
    expect(ranked.map((c) => c.story.id)).not.toContain(unrelated.id);
  });

  it("caps the suggestions", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      triageStory(20 + i, { title: `Herb spawn map ${i}`, i_want: "herb spawn map", area: "map_travel" }),
    );
    expect(rankMergeCandidates(source, many, 3)).toHaveLength(3);
  });

  it("searches title and I want for every word", () => {
    expect(searchMergeTargets([close, otherArea, unrelated], "herb SPOTS").map((s) => s.id)).toEqual([close.id]);
    expect(searchMergeTargets([close, unrelated], "  ")).toHaveLength(2);
  });
});

describe("triageErrorView", () => {
  it("names the field the service refused a link or @name in", () => {
    const view = triageErrorView(triageErrorFrom(422, { detail: "title: no links, HTML, markdown links or @names" }, null));
    expect(view).toEqual({ message: "No links or @names here", fields: ["title"] });
  });

  it("does not blame links for a schema error (too long, wrong type)", () => {
    const body = { detail: [{ loc: ["body", "so_that"], msg: "String should have at most 300 characters", type: "string_too_long" }] };
    expect(triageErrorView(triageErrorFrom(422, body, null))).toEqual({
      message: "Something in this form isn't allowed. Check the fields and try again.",
      fields: ["so_that"],
    });
  });

  it("tells a stale edit, a merge conflict and a merged story apart", () => {
    expect(triageErrorView(triageErrorFrom(412, { detail: "story_changed" }, null)).message).toBe("That story changed. I refreshed it.");
    expect(triageErrorView(triageErrorFrom(409, { detail: "merge_conflict" }, null)).message).toMatch(/Pick again/);
    expect(triageErrorView(triageErrorFrom(409, { detail: "status_conflict" }, null)).message).toBe(
      "This story was merged, so it can't be changed.",
    );
  });

  it("reports a rate limit and a lost connection", () => {
    expect(triageErrorView(triageErrorFrom(429, null, 10)).message).toBe("Slow down a moment");
    expect(triageErrorView(triageErrorFrom(undefined, null, null)).message).toMatch(/Couldn't reach the server/);
  });

  it("tells a signed-in account that isn't the operator so", () => {
    expect(triageErrorView(triageErrorFrom(403, { detail: "Forbidden" }, null)).message).toBe(
      "This account can't triage requests. Sign in as the operator.",
    );
  });
});
