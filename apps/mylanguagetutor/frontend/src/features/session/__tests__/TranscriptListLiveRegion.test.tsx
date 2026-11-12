import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TranscriptList from "@/features/session/TranscriptList";
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import type { TranscriptEntry } from "@mylanguagetutor/api-client/types/session/transcript-entry";

const ENTRY: TranscriptEntry = {
  key: "turn-1",
  learnerText: "Hola",
  replyText: "¡Hola! ¿Qué quieres?",
  translation: null,
  corrections: [],
  retryPrompt: null,
  status: "complete",
  correctionsMissing: false,
};

function list(canReplay: boolean) {
  return (
    <TranscriptList
      entries={[ENTRY]}
      languageName="Spanish"
      canSpeak
      canReplay={canReplay}
      waiting={false}
      busy={false}
      onReplay={vi.fn()}
      onTryRetry={vi.fn()}
      onSkipRetry={vi.fn()}
    />
  );
}

/** Everything the live region holds that a screen reader could announce, as text. */
function liveRegionText(container: HTMLElement): string {
  return container.querySelector('[aria-live="polite"]')?.textContent ?? "";
}

describe("TranscriptList live region", () => {
  it("doesn't change any text when replay is switched off, so the reader says nothing into the open microphone", () => {
    const { container, rerender } = render(list(true));
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    const before = liveRegionText(container);

    rerender(list(false));

    expect(liveRegionText(container)).toBe(before);
    expect(screen.getByRole("button", { name: PRACTICE_COPY.replay })).toBeDisabled();
    expect(screen.getByRole("button", { name: PRACTICE_COPY.replay })).toHaveAccessibleDescription(PRACTICE_COPY.replayUnavailableHint);

    rerender(list(true));

    expect(liveRegionText(container)).toBe(before);
    expect(screen.getByRole("button", { name: PRACTICE_COPY.replay })).toHaveAccessibleDescription(PRACTICE_COPY.replayHint);
    expect(screen.getByRole("button", { name: PRACTICE_COPY.replaySlow })).toHaveAccessibleDescription(PRACTICE_COPY.replaySlowHint);
  });
});
