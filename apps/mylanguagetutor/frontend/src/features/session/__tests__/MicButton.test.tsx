import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MicButton from "@/features/session/MicButton";
import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";

describe("MicButton", () => {
  it("names the button for the phase and is not also a pressed toggle", () => {
    const { rerender } = render(<MicButton phase="idle" disabled={false} onStart={vi.fn()} onStop={vi.fn()} />);
    expect(screen.getByRole("button", { name: VOICE_COPY.micLabels.idle })).not.toHaveAttribute("aria-pressed");

    rerender(<MicButton phase="listening" disabled={false} onStart={vi.fn()} onStop={vi.fn()} />);
    expect(screen.getByRole("button", { name: VOICE_COPY.micLabels.listening })).not.toHaveAttribute("aria-pressed");
  });
});
