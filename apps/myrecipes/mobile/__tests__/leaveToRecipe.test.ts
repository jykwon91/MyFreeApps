import { type FakeStack, fakeStack } from "./support/fakeStack";
import { leaveToRecipe } from "../src/utils/leaveToRecipe";

let mockStack: FakeStack;
const mockBack = jest.fn();
const mockDismiss = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    back: () => {
      mockBack();
      mockStack.back();
    },
    dismiss: (count?: number) => {
      mockDismiss(count);
      mockStack.dismiss(count);
    },
    replace: (href: { pathname: string; params?: object }) => {
      mockReplace(href);
      mockStack.replace(href);
    },
  },
}));

const TABS = { name: "(tabs)" };
const SOUP = { name: "recipes/[id]", params: { id: "r1", from: "discover" } };
const STEW = { name: "recipes/[id]", params: { id: "r2" } };
const TWEAK = { name: "recipes/[id]/tweak", params: { id: "r1" } };

function leave(): void {
  leaveToRecipe(mockStack.state(), "r1");
}

beforeEach(() => {
  mockBack.mockClear();
  mockDismiss.mockClear();
  mockReplace.mockClear();
});

describe("leaveToRecipe", () => {
  it("goes back to the recipe when it's the screen below", () => {
    mockStack = fakeStack([TABS, SOUP, TWEAK]);
    leave();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockStack.routes()).toEqual([TABS, SOUP]);
  });

  it("pops past a diff and the list to the recipe, which keeps its own params", () => {
    const versions = { name: "recipes/[id]/versions", params: { id: "r1" } };
    const diff = { name: "recipes/[id]/versions/[vid]/diff", params: { id: "r1", vid: "v3", from: "versions" } };
    // r1 is open twice; the nearest one is where Back from the diff would have led.
    const olderSoup = { name: "recipes/[id]", params: { id: "r1" } };
    mockStack = fakeStack([TABS, olderSoup, STEW, SOUP, versions, diff, TWEAK]);
    leave();
    expect(mockDismiss).toHaveBeenCalledWith(3);
    expect(mockStack.routes()).toEqual([TABS, olderSoup, STEW, SOUP]);
  });

  it("opens the recipe in place, rather than turning another recipe below into it", () => {
    mockStack = fakeStack([TABS, STEW, TWEAK]);
    leave();
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/recipes/[id]", params: { id: "r1" } });
    expect(mockStack.routes()).toEqual([TABS, STEW, { name: "recipes/[id]", params: { id: "r1" } }]);
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it("opens the recipe in place when it isn't in the stack", () => {
    mockStack = fakeStack([TABS, TWEAK]);
    leave();
    expect(mockStack.routes()).toEqual([TABS, { name: "recipes/[id]", params: { id: "r1" } }]);
  });

  it("opens the recipe in place before the stack has a state", () => {
    mockStack = fakeStack([TWEAK]);
    leaveToRecipe(undefined, "r1");
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/recipes/[id]", params: { id: "r1" } });
  });
});
