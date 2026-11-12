// Drives the conversation screen as the learner and the server would, for the conversation tests.
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { practicePath } from "@mylanguagetutor/api-client/utils/practicePath";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { tokens } from "@platform/mobile/test-support/storedSession";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { AppState } from "react-native";
import type { AppStateStatus } from "react-native";
import { ONBOARDED_LEARNER_ROUTES } from "./onboardedLearner";
import { renderApp } from "./renderApp";
import { CORRECTION, TUTOR_SESSION } from "./tutorRecords";
import type { FakeTurnStream } from "./types/FakeTurnStream";

let refreshes = 0;

/** How many times the phone has renewed its sign-in. */
export function refreshCount(): number {
  return refreshes;
}

/** A learner who has onboarded, with a conversation the server opens on the first turn, plus any overrides. */
export function serveConversation(overrides: Record<string, FakeRoute> = {}): SentRequest[] {
  return serve({
    "POST /auth/mobile/refresh": () => {
      refreshes += 1;
      return { status: 200, data: tokens(refreshes) };
    },
    ...ONBOARDED_LEARNER_ROUTES,
    "POST /sessions": () => ({ status: 201, data: TUTOR_SESSION }),
    ...overrides,
  });
}

/** Tells every listener the app moved to `state`, as the phone does when the learner leaves or comes back. */
export async function moveApp(state: AppStateStatus): Promise<void> {
  const listeners = jest
    .mocked(AppState.addEventListener)
    .mock.calls.flatMap(([type, listener]) => (type === "change" ? [listener as (next: AppStateStatus) => void] : []));
  await act(async () => listeners.forEach((listener) => listener(state)));
}

export async function openCafe(): Promise<void> {
  await renderApp(practicePath("cafe"));
  expect(await screen.findByRole("header", { name: "At the cafe" })).toBeTruthy();
}

export async function write(text: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText(PRACTICE_COPY.typingOnlyLabel), text);
  await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.send }));
}

/** The server writes to a reply the screen is reading. */
export async function serverWrites(writeReply: () => void): Promise<void> {
  await act(async () => writeReply());
}

/** The rest of a reply after its first words: the end, the corrections, and done. */
export async function finish(stream: FakeTurnStream, { complete = false } = {}): Promise<void> {
  await serverWrites(() => stream.emit("reply.done", {}));
  await finishAfterReply(stream, { complete });
}

/** What follows a whole reply: the corrections, and done. */
export async function finishAfterReply(stream: FakeTurnStream, { complete = false } = {}): Promise<void> {
  await serverWrites(() => {
    stream.emit("corrections", {
      items: [CORRECTION],
      retry_prompt: "Try saying: Quiero un café.",
      scenario_state: { goals_met: complete ? [0] : [], complete },
      translation: "Hi! What would you like?",
    });
    stream.emit("done", { status: "complete", usage: { remaining_fraction: 0.5 } });
    stream.close();
  });
}
