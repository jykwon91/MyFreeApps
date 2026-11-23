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

function list(canReplay: boolean, entry: TranscriptEntry = ENTRY) {
  return (
    <TranscriptList
      entries={[entry]}
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

describe("TranscriptList", () => {
  it("isn't a live region, so a streaming reply isn't read chunk by chunk over the tutor's voice", () => {
    const { container } = render(list(true, { ...ENTRY, replyText: "¡Hola! ¿Qu", status: "pending" }));

    expect(container.querySelector("[aria-live]")).toBeNull();
    expect(screen.getByText("¡Hola! ¿Qu")).toBeInTheDocument();
  });

  it("explains why Replay is switched off while the microphone is open, and drops that once it closes", () => {
    const { rerender } = render(list(false));

    expect(screen.getByRole("button", { name: PRACTICE_COPY.replay })).toBeDisabled();
    expect(screen.getByRole("button", { name: PRACTICE_COPY.replay })).toHaveAccessibleDescription(PRACTICE_COPY.replayUnavailableHint);

    rerender(list(true));

    expect(screen.getByRole("button", { name: PRACTICE_COPY.replay })).toHaveAccessibleDescription(PRACTICE_COPY.replayHint);
    expect(screen.getByRole("button", { name: PRACTICE_COPY.replaySlow })).toHaveAccessibleDescription(PRACTICE_COPY.replaySlowHint);
  });
});
