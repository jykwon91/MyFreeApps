import { archiveFailure, saveBanner, saveFailure } from "../src/features/replyTemplates/replyTemplateFailure";
import {
  changedFields,
  formProblems,
  hasAnyText,
  insertAtCursor,
  nameClash,
  normalise,
  toFormValues,
  unknownVariables,
} from "../src/features/replyTemplates/replyTemplateFormValues";
import { aReplyTemplate } from "../test-support/aReplyTemplate";

const at = (start: number, end = start) => ({ start, end });

describe("insertAtCursor", () => {
  it("puts the variable at the cursor and leaves the cursor after it", () => {
    expect(insertAtCursor("Hi , bye", at(3), "$name", 100)).toEqual({ text: "Hi $name, bye", cursor: 8 });
  });

  it("replaces what's selected", () => {
    expect(insertAtCursor("Hi there,", at(3, 8), "$name", 100)).toEqual({ text: "Hi $name,", cursor: 8 });
  });

  it("reads a selection made backwards", () => {
    expect(insertAtCursor("Hi there,", at(8, 3), "$name", 100)).toEqual({ text: "Hi $name,", cursor: 8 });
  });

  it("works on nothing", () => {
    expect(insertAtCursor("", at(0), "$name", 100)).toEqual({ text: "$name", cursor: 5 });
  });

  it.each([
    ["a letter", "Hi", "Hi $name"],
    ["a digit", "Room 2", "Room 2 $name"],
    ["a dollar sign", "Cost $", "Cost $ $name"],
  ])("adds a space after %s", (_label, text, expected) => {
    expect(insertAtCursor(text, at(text.length), "$name", 100)?.text).toBe(expected);
  });

  it.each([
    ["a letter", "ok", "$name ok"],
    ["a digit", "2", "$name 2"],
    ["an underscore", "_x", "$name _x"],
  ])("adds a space before %s, or the server would fill in part of the word", (_label, after, expected) => {
    expect(insertAtCursor(after, at(0), "$name", 100)?.text).toBe(expected);
  });

  it("adds no space beside a space, a newline or punctuation", () => {
    expect(insertAtCursor("Hi \n,", at(4), "$name", 100)?.text).toBe("Hi \n$name,");
  });

  it("puts the cursor after the space it added", () => {
    expect(insertAtCursor("Hi", at(2), "$name", 100)).toEqual({ text: "Hi $name", cursor: 8 });
  });

  it("says no when it wouldn't fit, and fits exactly to the limit", () => {
    expect(insertAtCursor("abc ", at(4), "$name", 8)).toBeNull();
    expect(insertAtCursor("abc ", at(4), "$name", 9)?.text).toBe("abc $name");
  });

  it("counts the text a selection takes out", () => {
    expect(insertAtCursor("abcdef", at(0, 6), "$name", 5)?.text).toBe("$name");
  });

  it("copes with a selection past the end", () => {
    expect(insertAtCursor("Hi", at(9), "$name", 100)?.text).toBe("Hi $name");
  });
});

describe("unknownVariables", () => {
  it("finds a typo, once", () => {
    expect(unknownVariables("About $listin", "Hi $nam,\n$nam")).toEqual(["$listin", "$nam"]);
  });

  it("leaves prices alone", () => {
    expect(unknownVariables("$500 a month", "$1,200")).toEqual([]);
  });

  it("knows a variable followed by an apostrophe", () => {
    expect(unknownVariables("Hi", "$name's room")).toEqual([]);
  });

  it("doesn't call a known variable with letters after it unknown, because the server fills it in", () => {
    expect(unknownVariables("Hi", "$names")).toEqual([]);
  });

  it("knows all the real ones", () => {
    expect(unknownVariables("$name $listing $dates $start_date $end_date", "$employer $host_name $host_phone")).toEqual([]);
  });
});

describe("normalise", () => {
  it("trims, and keeps a subject on one line", () => {
    expect(normalise({ name: "  Decline ", subject: " About\r\n the  room\n", body: "\n Hi\n\nBye  \n" })).toEqual({
      name: "Decline",
      subject: "About the  room",
      body: "Hi\n\nBye",
    });
  });
});

describe("changedFields", () => {
  const original = aReplyTemplate();

  it("is empty when nothing changed, even with spaces added round the edges", () => {
    expect(changedFields({ ...toFormValues(original), name: ` ${original.name} ` }, original)).toEqual({});
  });

  it("holds only what changed", () => {
    expect(changedFields({ ...toFormValues(original), subject: "New subject" }, original)).toEqual({ subject_template: "New subject" });
    expect(changedFields({ name: "N", subject: "S", body: "B" }, original)).toEqual({ name: "N", subject_template: "S", body_template: "B" });
  });
});

describe("nameClash", () => {
  const templates = [aReplyTemplate({ id: "a", name: "Decline" }), aReplyTemplate({ id: "b", name: "Welcome" })];

  it("is true for another template's name", () => {
    expect(nameClash("Welcome", templates, "a")).toBe(true);
    expect(nameClash("Welcome", templates, null)).toBe(true);
  });

  it("is false for its own name", () => {
    expect(nameClash("Decline", templates, "a")).toBe(false);
  });

  it("goes by exact case, as the server does", () => {
    expect(nameClash("decline", templates, null)).toBe(false);
  });
});

describe("formProblems and hasAnyText", () => {
  it("names each empty field", () => {
    expect(Object.keys(formProblems({ name: "", subject: "", body: "" }, [], null))).toEqual(["name", "subject", "body"]);
  });

  it("catches a name that's taken, when it knows the others", () => {
    const templates = [aReplyTemplate({ id: "a", name: "Decline" })];
    expect(formProblems({ name: "Decline", subject: "s", body: "b" }, templates, null).name).toBeDefined();
    expect(formProblems({ name: "Decline", subject: "s", body: "b" }, undefined, null)).toEqual({});
  });

  it("sees whether anything's been typed", () => {
    expect(hasAnyText({ name: "", subject: "", body: "" })).toBe(false);
    expect(hasAnyText({ name: "", subject: "", body: " " })).toBe(true);
  });
});

describe("failure mapping", () => {
  it.each([
    [undefined, "noResponse"],
    [403, "viewOnly"],
    [404, "gone"],
    [409, "nameTaken"],
    [422, "other"],
    [500, "serverError"],
    [502, "serverError"],
  ] as const)("a save that fails with %s is %s", (status, expected) => {
    expect(saveFailure({ status })).toBe(expected);
  });

  it("treats an error with no status as no response", () => {
    expect(saveFailure(new Error("Network Error"))).toBe("noResponse");
  });

  it("never reads a 409 on archive as a taken name", () => {
    expect(archiveFailure({ status: 409 })).toBe("other");
    expect(archiveFailure({ status: 404 })).toBe("gone");
    expect(archiveFailure({ status: undefined })).toBe("noResponse");
    expect(archiveFailure({ status: 403 })).toBe("viewOnly");
    expect(archiveFailure({ status: 502 })).toBe("other");
  });

  it("shows a banner only for the failures that have one", () => {
    expect(saveBanner("noResponse")).toMatch(/can't reach the server/);
    expect(saveBanner("viewOnly")).toMatch(/view-only/);
    expect(saveBanner("other")).toMatch(/couldn't save/);
    expect(saveBanner("serverError")).toMatch(/couldn't save/);
    expect(saveBanner("unsure")).toMatch(/not sure that saved/);
    expect(saveBanner("nameTaken")).toBeNull();
    expect(saveBanner("gone")).toBeNull();
  });
});
