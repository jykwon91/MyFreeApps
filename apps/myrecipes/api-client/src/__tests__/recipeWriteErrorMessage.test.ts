import { describe, expect, it } from "vitest";
import { COOK_LOG_MESSAGES } from "../constants/cookLog";
import { CONNECTION_MESSAGES } from "../constants/connectionCopy";
import { RECIPE_MANAGE_MESSAGES } from "../constants/recipeManage";
import { RECIPE_WRITE_MESSAGES, RECIPE_WRITE_UNSURE } from "../constants/recipeWriteErrors";
import { TWEAK_MESSAGES } from "../constants/tweak";
import { recipeWriteErrorMessage } from "../utils/recipeWriteErrorMessage";

describe("recipeWriteErrorMessage", () => {
  it("says the server can't be reached when an update got no answer, which is safe to send again", () => {
    expect(recipeWriteErrorMessage({ status: undefined }, "update")).toBe(CONNECTION_MESSAGES.write);
    expect(recipeWriteErrorMessage({ status: "FETCH_ERROR" }, "update")).toBe(CONNECTION_MESSAGES.write);
  });

  it.each([
    ["no answer came back", { status: undefined, data: "Network Error" }],
    ["it timed out", { status: undefined, data: "timeout of 30000ms exceeded" }],
    ["RTK timed out", { status: "TIMEOUT_ERROR" }],
    ["the server broke without a reason", { status: 500, data: "Internal Server Error" }],
    ["the proxy failed", { status: 502, data: "<html>Bad Gateway</html>" }],
  ])("says to check before trying again when a new recipe, tweak or cook may have saved: %s", (_, error) => {
    expect(recipeWriteErrorMessage(error, "create")).toBe(
      "We're not sure this recipe was saved. Check your recipes before trying again, so you don't end up with two.",
    );
    expect(recipeWriteErrorMessage(error, "tweak")).toBe(RECIPE_WRITE_UNSURE.tweak);
    expect(recipeWriteErrorMessage(error, "logCook")).toBe(RECIPE_WRITE_UNSURE.logCook);
  });

  it("keeps the plain wording when the server refused a new one with its own reason", () => {
    expect(recipeWriteErrorMessage({ status: 503, data: { detail: "Database unavailable" } }, "create")).toBe(RECIPE_WRITE_MESSAGES.serverTrouble);
    expect(recipeWriteErrorMessage({ status: 400, data: { detail: "nope" } }, "logCook")).toBe(COOK_LOG_MESSAGES.couldntLog);
  });

  it("says why by status", () => {
    expect(recipeWriteErrorMessage({ status: 401 }, "create")).toBe(RECIPE_WRITE_MESSAGES.signedOut);
    expect(recipeWriteErrorMessage({ status: 403 }, "update")).toBe(RECIPE_WRITE_MESSAGES.forbidden);
    expect(recipeWriteErrorMessage({ status: 413 }, "create")).toBe(RECIPE_WRITE_MESSAGES.tooLarge);
    expect(recipeWriteErrorMessage({ status: 429 }, "logCook")).toBe(RECIPE_WRITE_MESSAGES.slowDown);
    expect(recipeWriteErrorMessage({ status: 500 }, "update")).toBe(RECIPE_WRITE_MESSAGES.serverTrouble);
  });

  it("shows the server's own reason for a 422, plain or a list", () => {
    expect(recipeWriteErrorMessage({ status: 422, data: { detail: "Title is already used." } }, "create")).toBe(
      "Title is already used.",
    );
    const list = { status: 422, data: { detail: [{ msg: "Value error, Title is too long." }, { msg: "Source is not a link." }] } };
    expect(recipeWriteErrorMessage(list, "update")).toBe("Title is too long. Source is not a link.");
  });

  it("falls back to the write's own wording when there is nothing more specific", () => {
    expect(recipeWriteErrorMessage({ status: 422 }, "create")).toBe(RECIPE_MANAGE_MESSAGES.couldntCreate);
    expect(recipeWriteErrorMessage({ status: 404 }, "update")).toBe(RECIPE_MANAGE_MESSAGES.couldntUpdate);
    expect(recipeWriteErrorMessage({ status: 418 }, "logCook")).toBe(COOK_LOG_MESSAGES.couldntLog);
    expect(recipeWriteErrorMessage(new Error("boom"), "update")).toBe(RECIPE_MANAGE_MESSAGES.couldntUpdate);
  });

  it("keeps a tweak's own wording", () => {
    expect(recipeWriteErrorMessage({ status: 400 }, "tweak")).toBe(TWEAK_MESSAGES.changedOrNotYours);
    expect(recipeWriteErrorMessage({ status: 404 }, "tweak")).toBe(TWEAK_MESSAGES.changedOrNotYours);
    expect(recipeWriteErrorMessage({ status: 422 }, "tweak")).toBe(TWEAK_MESSAGES.checkEntries);
    expect(recipeWriteErrorMessage({ status: 401 }, "tweak")).toBe(TWEAK_MESSAGES.signInAgain);
  });

  it("has nothing to say about a write a cache reset called off", () => {
    // What RTK Query rejects with when signing out or changing account aborts the request.
    expect(recipeWriteErrorMessage({ name: "AbortError", message: "Aborted" }, "create")).toBeNull();
  });
});
