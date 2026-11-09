import { MORTGAGE_FORM_MESSAGES, MORTGAGE_STATEMENT_MESSAGES } from "../src/constants/mortgageForm";
import { MORTGAGE_MESSAGES } from "../src/constants/mortgages";
import { mortgageRemoveFailure } from "../src/features/mortgages/mortgageRemoveFailure";
import { mortgageWriteFailure } from "../src/features/mortgages/mortgageWriteFailure";
import { statementReadFailure } from "../src/features/mortgages/statementReadFailure";

function failed(status?: number, detail: unknown = "raw server text") {
  return status === undefined ? { error: "Network Error" } : { status, data: { detail } };
}

describe("mortgageWriteFailure", () => {
  it.each([
    [undefined, "create", MORTGAGE_FORM_MESSAGES.createUnsure],
    [undefined, "update", MORTGAGE_FORM_MESSAGES.lostConnection],
    [403, "update", MORTGAGE_FORM_MESSAGES.viewOnly],
    [404, "create", MORTGAGE_FORM_MESSAGES.goneProperty],
    [404, "update", MORTGAGE_FORM_MESSAGES.gone],
    [422, "update", MORTGAGE_FORM_MESSAGES.invalid],
    [500, "create", MORTGAGE_FORM_MESSAGES.createUnsure],
    [500, "update", MORTGAGE_FORM_MESSAGES.retry],
    [409, "update", MORTGAGE_FORM_MESSAGES.retry],
  ] as const)("status %s on %s", (status, write, expected) => {
    expect(mortgageWriteFailure(failed(status), write)).toBe(expected);
  });

  it("never shows the server's own text", () => {
    expect(mortgageWriteFailure(failed(500, "Traceback: boom"), "update")).not.toContain("boom");
  });
});

describe("statementReadFailure", () => {
  it.each([
    [undefined, MORTGAGE_STATEMENT_MESSAGES.lostConnection],
    [403, MORTGAGE_STATEMENT_MESSAGES.viewOnly],
    [404, MORTGAGE_STATEMENT_MESSAGES.gone],
    [413, MORTGAGE_STATEMENT_MESSAGES.tooBig],
    [415, MORTGAGE_STATEMENT_MESSAGES.wrongType],
    [422, MORTGAGE_STATEMENT_MESSAGES.unreadable],
    [429, MORTGAGE_STATEMENT_MESSAGES.tooMany],
    [503, MORTGAGE_STATEMENT_MESSAGES.storageDown],
    [500, MORTGAGE_STATEMENT_MESSAGES.somethingWrong],
  ])("status %s", (status, expected) => {
    expect(statementReadFailure(failed(status))).toBe(expected);
  });
});

describe("mortgageRemoveFailure", () => {
  it("treats a loan that is already gone as done", () => {
    expect(mortgageRemoveFailure(failed(404))).toBe("gone");
  });

  it("maps the rest to fixed copy", () => {
    expect(mortgageRemoveFailure(failed(undefined))).toEqual({ message: MORTGAGE_MESSAGES.removeLostConnection });
    expect(mortgageRemoveFailure(failed(403))).toEqual({ message: MORTGAGE_MESSAGES.removeViewOnly });
    expect(mortgageRemoveFailure(failed(500))).toEqual({ message: MORTGAGE_MESSAGES.removeFailed });
  });
});
