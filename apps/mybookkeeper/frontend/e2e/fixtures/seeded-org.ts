import { test, type APIRequestContext } from "@playwright/test";
import { SoloOrg } from "./solo-org";

/**
 * Gives the enclosing file (or describe block) one fresh organization: created
 * (and seeded, if ``seed`` is given) before its tests, deleted after them. Returns a getter for use
 * inside the tests.
 */
export function seededOrg(label: string, seed?: (api: APIRequestContext) => Promise<unknown>): () => SoloOrg {
  let solo: SoloOrg | undefined;

  test.beforeAll(async ({ playwright }) => {
    solo = await SoloOrg.create(playwright, label);
    await seed?.(solo.api);
  });

  test.afterAll(async ({ playwright }) => {
    await solo?.delete(playwright);
  });

  return () => {
    if (!solo) throw new Error(`the ${label} organization was not created`);
    return solo;
  };
}
