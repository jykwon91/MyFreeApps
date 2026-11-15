import { describe, expect, it } from "vitest";
import { currentListData } from "@/shared/utils/current-list-data";

const PREVIOUS = { items: ["previous filter's row"] };
const CURRENT = { items: ["current filter's row"] };

describe("currentListData", () => {
  it("shows the answer for the current filters", () => {
    expect(currentListData({ data: CURRENT, currentData: CURRENT }, false)).toBe(CURRENT);
    expect(currentListData({ data: CURRENT, currentData: CURRENT }, true)).toBe(CURRENT);
  });

  it("drops the previous filter's rows while a new filter loads or after it failed", () => {
    expect(currentListData({ data: PREVIOUS, currentData: undefined }, false)).toBeUndefined();
  });

  it("keeps the rows already shown while 'Load more' loads or after it failed", () => {
    expect(currentListData({ data: PREVIOUS, currentData: undefined }, true)).toBe(PREVIOUS);
  });

  it("has nothing before the first answer", () => {
    expect(currentListData({ data: undefined, currentData: undefined }, false)).toBeUndefined();
    expect(currentListData({ data: undefined, currentData: undefined }, true)).toBeUndefined();
  });
});
