/** One call for a spec's setup: signed in, speech faked, and the tutor API stubbed. */
import type { Page } from "@playwright/test";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import type { SpeechFakeOptions } from "../types/SpeechFakeOptions";
import type { TutorApi } from "../types/TutorApi";
import type { TutorApiStubOptions } from "../types/TutorApiStubOptions";
import { installSpeechFakes } from "./speechFakes";
import { stubTutorApi } from "./stubTutorApi";

export async function signedInTutor(
  page: Page,
  options: TutorApiStubOptions = {},
  speech: SpeechFakeOptions = { recognition: false },
): Promise<TutorApi> {
  await stubSignedInShell(page);
  await installSpeechFakes(page, speech);
  return stubTutorApi(page, options);
}
