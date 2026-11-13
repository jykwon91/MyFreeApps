import { afterEach, describe, expect, it } from "vitest";
import {
  featureRequestListQuery,
  isFilteredBoard,
  listArgsFor,
  parseBoardFilters,
  suggestPagePath,
  withBoardFilters,
} from "@/games/wow-forever/lib/featureRequests/boardParams";
import {
  aboutYouSummary,
  areaChipLabel,
  comeBackLabel,
  ideasCountLabel,
  playersAskedLabel,
  storySentence,
} from "@/games/wow-forever/lib/featureRequests/featureRequestFormat";
import { isMergedRedirect, isSitePath, isVotableStatus } from "@/games/wow-forever/lib/featureRequests/featureRequestGuards";
import { parseMyIdeas, readMyIdeas, withApproved, withIdea } from "@/games/wow-forever/lib/featureRequests/myIdeas";
import {
  levelBandFor,
  prefillFromPlayer,
  readPlayerPrefill,
} from "@/games/wow-forever/lib/featureRequests/playerSettingsPrefill";
import { stableOrder } from "@/games/wow-forever/lib/featureRequests/stableOrder";
import { answerBody, givenContext, ideaBody } from "@/games/wow-forever/lib/featureRequests/submissionBody";
import { parseRetryAfter, submitFailureFrom } from "@/games/wow-forever/lib/featureRequests/submitFailure";
import { submitStageAt } from "@/games/wow-forever/lib/featureRequests/submitStage";
import {
  clearSuggestionDraft,
  readSuggestionDraft,
  writeSuggestionDraft,
} from "@/games/wow-forever/lib/featureRequests/suggestionDraft";
import { getVoterId, isUuid, randomUuid } from "@/games/wow-forever/lib/featureRequests/voterId";
import { MY_IDEAS_STORAGE_KEY, VOTER_ID_STORAGE_KEY } from "@/games/wow-forever/data/featureRequests/suggestStorageKeys";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";

function axiosError(status: number, data: unknown = {}, headers: Record<string, string> = {}): unknown {
  return { isAxiosError: true, response: { status, data, headers } };
}

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("board params", () => {
  it("falls back to the defaults for missing or unknown values", () => {
    const filters = parseBoardFilters(new URLSearchParams("status=bogus&area=nope&sort=hot&r=not-a-uuid"));
    expect(filters).toEqual({ status: "open", area: null, sort: "top", highlight: null });
  });

  it("reads valid filters and a highlight id", () => {
    const filters = parseBoardFilters(new URLSearchParams(`status=shipped&area=professions&sort=new&r=${ID_A}`));
    expect(filters).toEqual({ status: "shipped", area: "professions", sort: "new", highlight: ID_A });
  });

  it("leaves defaults out of the URL and keeps other keys", () => {
    const next = withBoardFilters(new URLSearchParams("status=shipped&x=1"), { status: "open", sort: "top" });
    expect(next.toString()).toBe("x=1");
    const filtered = withBoardFilters(new URLSearchParams(), { area: "pvp", sort: "new" });
    expect(filtered.get("area")).toBe("pvp");
    expect(filtered.get("sort")).toBe("new");
  });

  it("only counts status and area as filtering (sort is not a filter)", () => {
    expect(isFilteredBoard({ status: "open", area: null, sort: "new", highlight: null })).toBe(false);
    expect(isFilteredBoard({ status: "all", area: null, sort: "top", highlight: null })).toBe(true);
    expect(isFilteredBoard({ status: "open", area: "pvp", sort: "top", highlight: null })).toBe(true);
  });

  it("asks the API for every open-ish status under the Open chip, repeated", () => {
    const args = listArgsFor({ status: "open", area: "professions", sort: "top", highlight: ID_A }, CLIENT);
    const query = new URLSearchParams(featureRequestListQuery(args, 20, 20));
    expect(query.getAll("status")).toEqual(["open", "planned", "in_progress"]);
    expect(query.get("area")).toBe("professions");
    expect(query.get("offset")).toBe("20");
    expect(query.get("limit")).toBe("20");
    expect(query.get("client_id")).toBe(CLIENT);
  });

  it("sends no status for All", () => {
    const args = listArgsFor({ status: "all", area: null, sort: "new", highlight: null }, CLIENT);
    const query = new URLSearchParams(featureRequestListQuery(args, 0, 20));
    expect(query.getAll("status")).toEqual([]);
    expect(query.has("area")).toBe(false);
  });

  it("links the footer to the suggest page with the page's area", () => {
    expect(suggestPagePath(null)).toBe("/wow-forever/suggest");
    expect(suggestPagePath("map_travel")).toBe("/wow-forever/suggest?area=map_travel");
  });
});

describe("submit failures", () => {
  it("treats no response (offline, timeout) as a network problem", () => {
    expect(submitFailureFrom(new Error("Network Error")).kind).toBe("network");
    expect(submitFailureFrom({ code: "ECONNABORTED" }).kind).toBe("network");
  });

  it("reads Retry-After seconds on a 429", () => {
    expect(submitFailureFrom(axiosError(429, {}, { "retry-after": "720" }))).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 720,
    });
    expect(submitFailureFrom(axiosError(429)).retryAfterSeconds).toBeNull();
  });

  it("parses Retry-After as an HTTP date", () => {
    const now = Date.parse("2026-11-06T12:00:00Z");
    expect(parseRetryAfter("Fri, 06 Nov 2026 12:02:00 GMT", now)).toBe(120);
    expect(parseRetryAfter("soon", now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
  });

  it("maps 503, captcha, bad input and other errors", () => {
    expect(submitFailureFrom(axiosError(503, { detail: "feature_requests_unavailable" })).kind).toBe("unavailable");
    expect(submitFailureFrom(axiosError(400, { detail: "captcha_verification_failed" })).kind).toBe("human_check");
    expect(submitFailureFrom(axiosError(400, { detail: "Captcha token required" })).kind).toBe("human_check");
    expect(submitFailureFrom(axiosError(400, { detail: "no captcha here" })).kind).toBe("too_short");
    expect(submitFailureFrom(axiosError(422, { detail: "Write 10-1000 characters." })).kind).toBe("too_short");
    expect(submitFailureFrom(axiosError(500)).kind).toBe("server");
  });
});

describe("submit stage", () => {
  it("moves through the status lines as the wait grows", () => {
    expect(submitStageAt(0)).toBe("reading");
    expect(submitStageAt(2_999)).toBe("reading");
    expect(submitStageAt(3_000)).toBe("understanding");
    expect(submitStageAt(7_500)).toBe("checking");
    expect(submitStageAt(15_000)).toBe("slow");
  });
});

describe("format", () => {
  it("counts players and ideas", () => {
    expect(playersAskedLabel(1)).toBe("1 player asked");
    expect(playersAskedLabel(12)).toBe("12 players asked");
    expect(ideasCountLabel(1)).toBe("1 idea");
    expect(ideasCountLabel(0)).toBe("0 ideas");
  });

  it("puts the topic inside the area chip", () => {
    expect(areaChipLabel("professions", "alchemy")).toBe("Professions · Alchemy");
    expect(areaChipLabel("pvp", null)).toBe("PvP");
    expect(areaChipLabel("pvp", "  ")).toBe("PvP");
  });

  it("builds one story sentence whatever lead-ins the refiner wrote", () => {
    expect(
      storySentence({ persona: "new Warlock", i_want: "I want a pet macro.", so_that: "so that I stop misclicking" }),
    ).toBe("As a new Warlock, I want a pet macro, so that I stop misclicking.");
    expect(storySentence({ persona: "As an Alliance leveler", i_want: "flight paths", so_that: "I save time" })).toBe(
      "As an Alliance leveler, I want flight paths, so that I save time.",
    );
    expect(storySentence({ persona: "alchemist", i_want: "x", so_that: "y" })).toBe("As an alchemist, I want x, so that y.");
  });

  it("says when to come back", () => {
    expect(comeBackLabel(null)).toBe("Come back later.");
    expect(comeBackLabel(0)).toBe("Come back later.");
    expect(comeBackLabel(30)).toBe("Come back in 1 minute.");
    expect(comeBackLabel(721)).toBe("Come back in 13 minutes.");
  });

  it("sums up the about-you answers", () => {
    expect(aboutYouSummary({})).toBe("");
    expect(aboutYouSummary({ class_id: "warlock", level_band: "21-30", faction: "undecided" })).toMatch(/^Warlock, /);
  });
});

describe("guards", () => {
  it("only lets open, planned and in-progress stories take votes", () => {
    expect(isVotableStatus("open")).toBe(true);
    expect(isVotableStatus("planned")).toBe(true);
    expect(isVotableStatus("in_progress")).toBe(true);
    expect(isVotableStatus("shipped")).toBe(false);
    expect(isVotableStatus("not_planned")).toBe(false);
  });

  it("only links a shipped story to a page on this site", () => {
    expect(isSitePath("/wow-forever/map")).toBe(true);
    expect(isSitePath("//evil.example/x")).toBe(false);
    expect(isSitePath("/\\evil.example")).toBe(false);
    expect(isSitePath("javascript:alert(1)")).toBe(false);
    expect(isSitePath("https://evil.example")).toBe(false);
  });

  it("recognises a merged-story redirect", () => {
    expect(isMergedRedirect({ merged_into_id: ID_A })).toBe(true);
  });
});

describe("stable order", () => {
  it("keeps cards where they were, appends new ones and drops gone ones", () => {
    const items = [{ id: "c" }, { id: "a" }, { id: "d" }];
    expect(stableOrder(["a", "b", "c"], items).map((i) => i.id)).toEqual(["a", "c", "d"]);
    expect(stableOrder([], items).map((i) => i.id)).toEqual(["c", "a", "d"]);
  });
});

describe("my ideas", () => {
  it("lists newest first without repeats", () => {
    const once = withIdea([], ID_A, "Alchemy route");
    const twice = withIdea(withIdea(once, ID_B, "Fishing spots"), ID_A, "Alchemy route");
    expect(twice.map((i) => i.id)).toEqual([ID_A, ID_B]);
  });

  it("marks approved ideas and returns the same array when nothing changed", () => {
    const ideas = withIdea([], ID_A, "Alchemy route");
    expect(withApproved(ideas, new Set())).toBe(ideas);
    expect(withApproved(ideas, new Set([ID_A]))[0].approved).toBe(true);
  });

  it("drops stored entries that aren't ideas", () => {
    expect(parseMyIdeas("nope")).toBeNull();
    expect(parseMyIdeas([{ id: ID_A, title: "ok", approved: false }, { id: "x", title: "bad", approved: false }])).toHaveLength(1);
    window.localStorage.setItem(MY_IDEAS_STORAGE_KEY, "{not json");
    expect(readMyIdeas()).toEqual([]);
  });
});

describe("voter id", () => {
  it("makes a v4 UUID and keeps it", () => {
    expect(isUuid(randomUuid())).toBe(true);
    const first = getVoterId();
    expect(isUuid(first)).toBe(true);
    expect(getVoterId()).toBe(first);
    expect(JSON.parse(window.localStorage.getItem(VOTER_ID_STORAGE_KEY) ?? "null")).toBe(first);
  });

  it("replaces a stored value that isn't a UUID", () => {
    window.localStorage.setItem(VOTER_ID_STORAGE_KEY, JSON.stringify("bogus"));
    expect(isUuid(getVoterId())).toBe(true);
  });
});

describe("player prefill", () => {
  it("bands levels", () => {
    expect(levelBandFor(1)).toBe("1-10");
    expect(levelBandFor(25)).toBe("21-30");
    expect(levelBandFor(59)).toBe("51-59");
    expect(levelBandFor(60)).toBe("60-fresh");
  });

  it("prefills class, faction and level band from the saved player", () => {
    const prefill = prefillFromPlayer({ faction: "H", classId: "warlock", zoneId: null, level: 24, position: null, characterSlug: null });
    expect(prefill.context).toEqual({ class_id: "warlock", faction: "horde", level_band: "21-30" });
    expect(prefill.summary).toMatch(/^Using your saved Warlock, /);
  });

  it("reads nothing when no player was saved, or the saved one is invalid", () => {
    expect(readPlayerPrefill()).toBeNull();
    window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ faction: "X", classId: "warlock" }));
    expect(readPlayerPrefill()).toBeNull();
    window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ faction: "A", classId: "mage" }));
    expect(readPlayerPrefill()?.context).toEqual({ class_id: "mage", faction: "alliance" });
  });
});

describe("submission body", () => {
  it("leaves out context nobody filled in", () => {
    expect(givenContext({ professions: [], activities: [] })).toBeUndefined();
    expect(ideaBody("  an idea  ", CLIENT, {})).toEqual({ text: "an idea", client_id: CLIENT });
  });

  it("links an answer to the first submission", () => {
    const body = answerBody("the idea", CLIENT, { class_id: "mage" }, ID_A, " east side ");
    expect(body).toEqual({
      text: "the idea",
      client_id: CLIENT,
      context: { class_id: "mage" },
      parent_submission_id: ID_A,
      clarification_answer: "east side",
    });
  });
});

describe("draft", () => {
  it("keeps the draft in sessionStorage until cleared", () => {
    expect(readSuggestionDraft()).toBe("");
    writeSuggestionDraft("half an idea");
    expect(readSuggestionDraft()).toBe("half an idea");
    clearSuggestionDraft();
    expect(readSuggestionDraft()).toBe("");
  });
});
