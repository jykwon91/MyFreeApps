import { describe, expect, it } from "vitest";
import { COOK_LOG_MESSAGES } from "../constants/cookLog";
import { RECIPE_MANAGE_MESSAGES } from "../constants/recipeManage";
import { deleteFailureOutcome } from "../utils/deleteFailureOutcome";

describe("deleteFailureOutcome", () => {
  it("treats a 404 as already gone, with each thing's own wording", () => {
    expect(deleteFailureOutcome({ status: 404 }, COOK_LOG_MESSAGES)).toEqual({ isGone: true, message: "This cook log was already deleted." });
    expect(deleteFailureOutcome({ status: 404 }, RECIPE_MANAGE_MESSAGES)).toEqual({ isGone: true, message: "This recipe was already deleted." });
  });

  it("treats any other failure as still there", () => {
    for (const error of [{ status: 500 }, { status: 403 }, { status: "FETCH_ERROR" }, new Error("offline"), undefined]) {
      expect(deleteFailureOutcome(error, COOK_LOG_MESSAGES)).toEqual({ isGone: false, message: COOK_LOG_MESSAGES.couldntDelete });
    }
  });
});
