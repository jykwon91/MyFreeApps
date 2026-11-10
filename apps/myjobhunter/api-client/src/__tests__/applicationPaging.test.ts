import { describe, expect, it } from "vitest";
import type { Application } from "../types/application";
import type { ApplicationListResponse } from "../types/application-list-response";
import { flattenApplicationPages } from "../utils/flattenApplicationPages";
import { getApplicationsTotal } from "../utils/getApplicationsTotal";
import { getNextApplicationsOffset } from "../utils/getNextApplicationsOffset";

const app = (id: string) => ({ id }) as Application;
const page = (ids: string[], total: number): ApplicationListResponse => ({ items: ids.map(app), total });

describe("getNextApplicationsOffset", () => {
  it("starts the next page where this one ended", () => {
    expect(getNextApplicationsOffset(page(["a", "b"], 5), 0)).toBe(2);
    expect(getNextApplicationsOffset(page(["c", "d"], 5), 2)).toBe(4);
  });

  it("stops once every matching row is loaded", () => {
    expect(getNextApplicationsOffset(page(["e"], 5), 4)).toBeUndefined();
    expect(getNextApplicationsOffset(page(["a", "b"], 2), 0)).toBeUndefined();
  });

  it("stops on an empty page even if the total says there is more", () => {
    // Rows deleted between page loads can leave the total ahead of what's left.
    expect(getNextApplicationsOffset(page([], 9), 4)).toBeUndefined();
  });
});

describe("flattenApplicationPages", () => {
  it("joins the pages in order", () => {
    expect(flattenApplicationPages([page(["a", "b"], 3), page(["c"], 3)]).map(({ id }) => id)).toEqual(["a", "b", "c"]);
  });

  it("keeps a row that shifted onto the next page where it first appeared", () => {
    expect(flattenApplicationPages([page(["a", "b"], 4), page(["b", "c"], 4)]).map(({ id }) => id)).toEqual(["a", "b", "c"]);
  });

  it("is empty before anything loads", () => {
    expect(flattenApplicationPages(undefined)).toEqual([]);
  });
});

describe("getApplicationsTotal", () => {
  it("reads the latest page's total", () => {
    expect(getApplicationsTotal([page(["a"], 3), page(["b"], 4)])).toBe(4);
  });

  it("is 0 before anything loads", () => {
    expect(getApplicationsTotal(undefined)).toBe(0);
    expect(getApplicationsTotal([])).toBe(0);
  });
});
