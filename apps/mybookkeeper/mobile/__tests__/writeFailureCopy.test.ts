import { actionFailureCopy, deleteFailureCopy, saveFailureCopy } from "../src/lib/writeFailureCopy";

// "noResponse" and "serverError" are the lost answers: the write may have gone through (see writeFailure).
const LOST = ["noResponse", "serverError"] as const;

describe("deleteFailureCopy", () => {
  it.each(LOST)("doesn't call a lost answer (%s) a failure, and says a retry is safe", (failure) => {
    const message = deleteFailureCopy("vendor")[failure];
    expect(message).toBe("I didn't get an answer, so I'm not sure that vendor was deleted. Trying again is safe.");
  });

  it("keeps the wording of a real refusal", () => {
    const copy = deleteFailureCopy("vendor");
    expect(copy.other).toBe("I couldn't delete that vendor. Want to try again?");
    expect(copy.conflict).toBe("Something still depends on that vendor, so I couldn't delete it.");
    expect(copy.gone).toBe("That vendor was already deleted.");
  });
});

describe("saveFailureCopy", () => {
  it.each(LOST)("for a change, doesn't call a lost answer (%s) a failure, and says saving again is safe", (failure) => {
    expect(saveFailureCopy("vendor", "vendors", false)[failure]).toBe("I didn't get an answer, so I'm not sure that saved. Trying again is safe.");
  });

  it.each(LOST)("for a new one, says to check before saving again after a lost answer (%s)", (failure) => {
    expect(saveFailureCopy("vendor", "vendors", true)[failure]).toBe(
      "I'm not sure that saved. Check your vendors before trying again, so you don't end up with two.",
    );
  });

  it("keeps the wording of a real refusal", () => {
    const copy = saveFailureCopy("vendor", "vendors", false);
    expect(copy.other).toBe("I couldn't save that. Want to try again?");
    expect(copy.viewOnly).toBe("You have view-only access, so I can't save this.");
  });
});

describe("actionFailureCopy", () => {
  it.each(LOST)("for one that's safe to repeat, says a retry is safe after a lost answer (%s)", (failure) => {
    expect(actionFailureCopy("cancel the sync", "safe")[failure]).toBe(
      "I didn't get an answer, so I'm not sure I managed to cancel the sync. Trying again is safe.",
    );
  });

  it.each(LOST)("for one that isn't, says where to look before retrying after a lost answer (%s)", (failure) => {
    expect(actionFailureCopy("start the sync", { checkFirst: "Pull down to see whether a sync started" })[failure]).toBe(
      "I didn't get an answer, so I'm not sure I managed to start the sync. Pull down to see whether a sync started before trying again.",
    );
  });

  it("keeps the wording of a real refusal, and lets one be replaced", () => {
    const copy = actionFailureCopy("start the sync", "safe", { conflict: "Already running." });
    expect(copy.other).toBe("I couldn't start the sync. Want to try again?");
    expect(copy.gone).toBe("I couldn't start the sync because it's no longer there. Pull down to refresh.");
    expect(copy.conflict).toBe("Already running.");
  });
});
