import { describe, expect, it } from "vitest";
import { DIFF_CHANGE_DISPLAY, VERSION_COPY } from "../constants/versions";
import type { DiffResponse } from "../types/recipe/diff";
import { diffErrorMessage } from "../utils/diffErrorMessage";
import { diffSummary } from "../utils/diffSummary";
import { ingredientChangeLine } from "../utils/ingredientChangeLine";
import { newestFirst } from "../utils/newestFirst";
import { orderForCompare } from "../utils/orderForCompare";
import { toggleCompareId } from "../utils/toggleCompareId";
import { versionNote } from "../utils/versionNote";

const SALT = { name: "salt", quantity: 1, unit: "tsp", note: null };

function diff(patch: Partial<DiffResponse> = {}): DiffResponse {
  return {
    from_version_id: "v1",
    from_version_number: 1,
    to_version_id: "v2",
    to_version_number: 2,
    ingredient_changes: [],
    step_changes: [],
    ...patch,
  };
}

describe("diffSummary", () => {
  it("counts ingredient and step changes", () => {
    const summary = diffSummary(
      diff({
        ingredient_changes: [
          { lineage_key: "a", change: "changed", before: SALT, after: { ...SALT, quantity: 2 } },
          { lineage_key: "b", change: "added", before: null, after: SALT },
        ],
        step_changes: [{ position: 1, change: "removed", before: "Stir.", after: null }],
      }),
    );
    expect(summary).toEqual({
      fromLabel: "v1",
      toLabel: "v2",
      title: "v1 to v2",
      ingredientCount: 2,
      stepCount: 1,
      total: 3,
      isIdentical: false,
      subtitle: "3 changes — 2 ingredient, 1 step.",
    });
  });

  it("says one change in the singular", () => {
    const summary = diffSummary(diff({ step_changes: [{ position: 1, change: "added", before: null, after: "Stir." }] }));
    expect(summary.subtitle).toBe("1 change — 0 ingredient, 1 step.");
  });

  it("calls two versions with nothing between them identical", () => {
    const summary = diffSummary(diff());
    expect(summary.isIdentical).toBe(true);
    expect(summary.total).toBe(0);
    expect(summary.subtitle).toBe(VERSION_COPY.noDifferences);
  });

  it("compares the first version against nothing", () => {
    const summary = diffSummary(diff({ from_version_id: null, from_version_number: null, to_version_number: 1 }));
    expect(summary.fromLabel).toBe("nothing");
    expect(summary.title).toBe("nothing to v1");
  });
});

describe("orderForCompare", () => {
  const v1 = { id: "a", version_number: 1 };
  const v3 = { id: "c", version_number: 3 };

  it("diffs the newer version against the older, whichever was picked first", () => {
    expect(orderForCompare(v1, v3)).toEqual({ versionId: "c", against: "a" });
    expect(orderForCompare(v3, v1)).toEqual({ versionId: "c", against: "a" });
  });
});

describe("toggleCompareId", () => {
  it("picks up to two and unpicks", () => {
    expect(toggleCompareId([], "a")).toEqual(["a"]);
    expect(toggleCompareId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleCompareId(["a", "b"], "c")).toEqual(["a", "b"]);
    expect(toggleCompareId(["a", "b"], "a")).toEqual(["b"]);
  });

  it("doesn't change the list it was given", () => {
    const picked = ["a"];
    toggleCompareId(picked, "b");
    expect(picked).toEqual(["a"]);
  });
});

describe("diffErrorMessage", () => {
  it("says why by status: not this recipe's, gone, or a bad link", () => {
    expect(diffErrorMessage({ status: 400 })).toBe(
      "One of these versions isn't part of this recipe, or no longer exists. Go back and pick two versions to compare.",
    );
    expect(diffErrorMessage({ status: 404 })).toBe("This recipe or one of its versions no longer exists.");
    expect(diffErrorMessage({ status: 422 })).toBe("This link isn't valid. Go back and pick two versions to compare.");
  });

  it("falls back to the general message otherwise", () => {
    expect(diffErrorMessage({ status: 500 })).toBe(VERSION_COPY.loadFailedBody);
    expect(diffErrorMessage({ status: "FETCH_ERROR" })).toBe(VERSION_COPY.loadFailedBody);
    expect(diffErrorMessage(undefined)).toBe(VERSION_COPY.loadFailedBody);
  });
});

describe("ingredientChangeLine", () => {
  it("formats the side that exists and leaves the other empty", () => {
    const change = { lineage_key: "a", change: "added" as const, before: null, after: { ...SALT, note: "fine" } };
    expect(ingredientChangeLine(change, "after")).toBe("1 tsp salt (fine)");
    expect(ingredientChangeLine(change, "before")).toBeNull();
  });
});

describe("versionNote", () => {
  it("uses the note, or says why there isn't one", () => {
    expect(versionNote({ change_note: "Less salt", version_number: 2 })).toEqual({ text: "Less salt", isPlaceholder: false });
    expect(versionNote({ change_note: null, version_number: 1 })).toEqual({ text: "Original recipe", isPlaceholder: true });
    expect(versionNote({ change_note: null, version_number: 2 })).toEqual({ text: "No change note", isPlaceholder: true });
  });
});

describe("DIFF_CHANGE_DISPLAY", () => {
  it("gives every kind a word and a symbol", () => {
    expect(DIFF_CHANGE_DISPLAY).toEqual({
      added: { label: "Added", symbol: "+" },
      removed: { label: "Removed", symbol: "−" },
      changed: { label: "Changed", symbol: "~" },
    });
  });
});

describe("newestFirst", () => {
  it("sorts newest first without changing the list it was given", () => {
    const versions = [{ id: "a", version_number: 1 }, { id: "c", version_number: 3 }, { id: "b", version_number: 2 }];
    expect(newestFirst(versions).map((version) => version.id)).toEqual(["c", "b", "a"]);
    expect(versions.map((version) => version.id)).toEqual(["a", "c", "b"]);
  });
});
