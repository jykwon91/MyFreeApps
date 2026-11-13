/**
 * The signed-in shell for a spec that pins the page's clock: the planted token
 * is issued at `instant`, so the auth guard finds it unexpired by that clock.
 */
import type { Page } from "@playwright/test";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { unsignedJwt } from "@platform/ui/test-support/unsignedJwt";

export async function stubSignedInShellAt(page: Page, instant: string): Promise<void> {
  await stubSignedInShell(page, { token: unsignedJwt(undefined, undefined, Date.parse(instant)) });
}
