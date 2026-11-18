import { describe, expect, it } from "vitest";
import { lostCreateMessage } from "../utils/lostCreateMessage";
import { newlyCreated } from "../utils/newlyCreated";
import { recheckLostCreate } from "../utils/recheckLostCreate";

const COPY = { failed: "Couldn't add it.", checkWhere: "your companies" };
const NO_ANSWER = { status: undefined, data: "Network Error" };

describe("newlyCreated", () => {
  const before = [{ id: "a", name: "Hooli" }];

  it("finds a matching item the list didn't hold before", () => {
    const made = { id: "b", name: "Hooli" };
    expect(newlyCreated(before, [...before, made], (item) => item.name === "Hooli")).toBe(made);
  });

  it("doesn't count one already there, or a new one that doesn't match", () => {
    expect(newlyCreated(before, [...before, { id: "c", name: "Globex" }], (item) => item.name === "Hooli")).toBeUndefined();
  });
});

describe("recheckLostCreate", () => {
  it("says created with what the read found, and not created when it finds nothing", async () => {
    expect(await recheckLostCreate(() => Promise.resolve("app-1"))).toEqual({ kind: "created", item: "app-1" });
    expect(await recheckLostCreate(() => Promise.resolve(undefined))).toEqual({ kind: "notCreated" });
  });

  it("can't tell when the read fails, and is silent when it was called off", async () => {
    expect(await recheckLostCreate(() => Promise.reject(NO_ANSWER))).toEqual({ kind: "unknown" });
    expect(await recheckLostCreate(() => Promise.reject({ name: "AbortError" }))).toEqual({ kind: "cancelled" });
  });
});

describe("lostCreateMessage", () => {
  it("gives the plain failure when it wasn't made", () => {
    expect(lostCreateMessage({ kind: "notCreated" }, NO_ANSWER, COPY)).toBe("Couldn't add it.");
  });

  it("says it may have saved, naming a lost connection when there was no answer", () => {
    expect(lostCreateMessage({ kind: "unknown" }, NO_ANSWER, COPY)).toBe(
      "I lost the connection, so I'm not sure that saved. Check your companies before trying again, so you don't end up with two.",
    );
    expect(lostCreateMessage({ kind: "unknown" }, { status: 504, data: "<html>" }, COPY)).toBe(
      "I'm not sure that saved. Check your companies before trying again, so you don't end up with two.",
    );
  });

  it("says nothing when it was made or called off", () => {
    expect(lostCreateMessage({ kind: "created", item: {} }, NO_ANSWER, COPY)).toBeNull();
    expect(lostCreateMessage({ kind: "cancelled" }, NO_ANSWER, COPY)).toBeNull();
  });
});
