import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import { COOK_COPY_LIMIT } from "../src/constants/cook";
import { clearCookCopies, deleteCookCopy, listCookCopies, loadCookCopy, saveCookCopy } from "../src/features/cook/cookCopies";

let mockState: object = { status: "signedIn", email: "a@example.com", sessionId: "s" };

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("../src/lib/session", () => ({ session: { getState: () => mockState } }));

const VERSION = {
  id: "v1",
  ingredients: [],
  steps: [{ id: "s1", position: 0, instruction: "Stir." }],
} as unknown as VersionResponse;

let now = 1_000;

beforeEach(() => {
  resetFakeFiles();
  mockState = { status: "signedIn", email: "a@example.com", sessionId: "s" };
  jest.spyOn(Date, "now").mockImplementation(() => (now += 1));
});

afterEach(() => {
  jest.restoreAllMocks();
});

it("keeps one copy per recipe, the latest version opened", () => {
  saveCookCopy("r1", "Soup", VERSION);
  saveCookCopy("r1", "Soup", { ...VERSION, id: "v2" });

  expect(fakeFiles()).toHaveLength(1);
  expect(loadCookCopy("r1")?.version.id).toBe("v2");
});

it("keeps only the most recently saved, dropping the oldest", () => {
  for (let index = 0; index <= COOK_COPY_LIMIT; index += 1) saveCookCopy(`r${index}`, "Soup", VERSION);

  expect(fakeFiles()).toHaveLength(COOK_COPY_LIMIT);
  expect(loadCookCopy("r0")).toBeNull();
  expect(loadCookCopy(`r${COOK_COPY_LIMIT}`)).not.toBeNull();
});

it("counts saving again as recent, so a recipe cooked often isn't the one dropped", () => {
  for (let index = 0; index < COOK_COPY_LIMIT; index += 1) saveCookCopy(`r${index}`, "Soup", VERSION);
  saveCookCopy("r0", "Soup", VERSION);
  saveCookCopy("new", "Soup", VERSION);

  expect(loadCookCopy("r0")).not.toBeNull();
  expect(loadCookCopy("r1")).toBeNull();
});

it("doesn't show one person's copy to another, or to nobody", () => {
  saveCookCopy("r1", "Soup", VERSION);

  mockState = { status: "signedIn", email: "b@example.com", sessionId: "t" };
  expect(loadCookCopy("r1")).toBeNull();
  mockState = { status: "signedOut", endedByServer: false, lastEmail: null };
  expect(loadCookCopy("r1")).toBeNull();
});

it("saves nothing while signed out", () => {
  mockState = { status: "signedOut", endedByServer: false, lastEmail: null };
  saveCookCopy("r1", "Soup", VERSION);
  expect(fakeFiles()).toEqual([]);
});

it("deletes one copy, or all of them", () => {
  saveCookCopy("r1", "Soup", VERSION);
  saveCookCopy("r2", "Soup", VERSION);

  deleteCookCopy("r1");
  deleteCookCopy("never-saved");
  expect(loadCookCopy("r1")).toBeNull();
  expect(loadCookCopy("r2")).not.toBeNull();

  clearCookCopies();
  expect(fakeFiles()).toEqual([]);
});

it("lists this person's copies, most recently cooked first", () => {
  saveCookCopy("r1", "Soup", VERSION);
  saveCookCopy("r2", "Stew", VERSION);
  saveCookCopy("r1", "Soup", VERSION);
  expect(listCookCopies().map((copy) => copy.recipeId)).toEqual(["r1", "r2"]);

  mockState = { status: "signedIn", email: "b@example.com", sessionId: "t" };
  expect(listCookCopies()).toEqual([]);
});
