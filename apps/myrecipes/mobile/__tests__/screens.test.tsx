import { COOK_SESSION_MAX_AGE_MS } from "../src/constants/cook";
import reducer, { ingredientToggled, pageChanged, sessionFinished, sessionOpened } from "../src/features/cook/cookSessionsSlice";
import { buildCookPages } from "../src/utils/buildCookPages";
import { countLabel } from "../src/utils/countLabel";
import { recipeFacts } from "../src/utils/recipeFacts";

describe("recipeFacts", () => {
  it("labels what's there and leaves out missing or zero values", () => {
    expect(recipeFacts({ servings: "4", prep_minutes: 15, cook_minutes: 30 })).toEqual([
      { label: "Servings", value: "4" },
      { label: "Prep", value: "15 min" },
      { label: "Cook", value: "30 min" },
    ]);
    expect(recipeFacts({ servings: null, prep_minutes: 0, cook_minutes: null })).toEqual([]);
  });
});

describe("buildCookPages", () => {
  const ingredient = { id: "i1", lineage_key: "l", position: 0, name: "salt", quantity: null, unit: null, note: null };
  const step = (id: string, position: number, instruction: string) => ({ id, position, instruction });

  it("orders steps, skips blank ones, and numbers what's left", () => {
    const pages = buildCookPages({
      ingredients: [ingredient],
      steps: [step("b", 2, "Second"), step("x", 1, "   "), step("a", 0, "First")],
    });
    expect(pages).toEqual([
      { kind: "ingredients" },
      { kind: "step", id: "a", instruction: "First", number: 1, timers: [], total: 2 },
      { kind: "step", id: "b", instruction: "Second", number: 2, timers: [], total: 2 },
      { kind: "done" },
    ]);
  });

  it("leaves out the ingredients page when there are none", () => {
    const pages = buildCookPages({ ingredients: [], steps: [step("a", 0, "First")] });
    expect(pages.map((page) => page.kind)).toEqual(["step", "done"]);
  });
});

describe("cookSessions", () => {
  const target = { recipeId: "r1", versionId: "v1" };

  it("toggles ingredients on and off and remembers the page", () => {
    let state = reducer(undefined, ingredientToggled({ ...target, ingredientId: "i1", now: 1 }));
    state = reducer(state, pageChanged({ ...target, pageIndex: 3, now: 2 }));
    expect(state.r1).toEqual({ versionId: "v1", pageIndex: 3, checked: ["i1"], updatedAt: 2 });
    state = reducer(state, ingredientToggled({ ...target, ingredientId: "i1", now: 3 }));
    expect(state.r1?.checked).toEqual([]);
  });

  it("starts over for a new version, but never expires mid-cook", () => {
    const started = reducer(undefined, ingredientToggled({ ...target, ingredientId: "i1", now: 0 }));
    const newVersion = reducer(started, pageChanged({ ...target, versionId: "v2", pageIndex: 1, now: 1 }));
    expect(newVersion.r1).toEqual({ versionId: "v2", pageIndex: 1, checked: [], updatedAt: 1 });
    const later = COOK_SESSION_MAX_AGE_MS * 2;
    const untick = reducer(started, ingredientToggled({ ...target, ingredientId: "i1", now: later }));
    expect(untick.r1?.checked).toEqual([]);
    expect(reducer(started, pageChanged({ ...target, pageIndex: 1, now: later })).r1?.checked).toEqual(["i1"]);
  });

  it("decides on opening whether the saved session carries on", () => {
    const opened = (saved: ReturnType<typeof reducer>, now: number, versionId = "v1") =>
      reducer(saved, sessionOpened({ recipeId: "r1", versionId, lastPage: 3, now })).r1;
    const started = reducer(undefined, pageChanged({ ...target, pageIndex: 1, now: 0 }));

    expect(opened(started, COOK_SESSION_MAX_AGE_MS)).toBeDefined();
    expect(opened(started, COOK_SESSION_MAX_AGE_MS + 1)).toBeUndefined();
    expect(opened(started, 0, "v2")).toBeUndefined();
    expect(opened(reducer(started, pageChanged({ ...target, pageIndex: 3, now: 0 })), 0)).toBeUndefined();
    expect(opened(reducer(started, pageChanged({ ...target, pageIndex: 9, now: 0 })), 0)).toBeUndefined();
  });

  it("forgets the recipe when finished", () => {
    const started = reducer(undefined, pageChanged({ ...target, pageIndex: 1, now: 1 }));
    expect(reducer(started, sessionFinished("r1")).r1).toBeUndefined();
  });
});

describe("countLabel", () => {
  it("handles singular and plural", () => {
    expect(countLabel(1, "version")).toBe("1 version");
    expect(countLabel(0, "recipe")).toBe("0 recipes");
    expect(countLabel(3, "version")).toBe("3 versions");
  });
});
