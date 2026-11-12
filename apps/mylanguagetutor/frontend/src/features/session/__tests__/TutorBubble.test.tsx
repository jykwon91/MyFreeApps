import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TutorBubble from "@/features/session/TutorBubble";

describe("TutorBubble", () => {
  it("names the replay buttons by what they show, and describes what they do", () => {
    const onReplay = vi.fn();
    const onReplaySlow = vi.fn();
    render(
      <TutorBubble text="¡Hola!" translation={null} partial={false} canSpeak canReplay onReplay={onReplay} onReplaySlow={onReplaySlow} />,
    );

    const replay = screen.getByRole("button", { name: "Replay" });
    const slow = screen.getByRole("button", { name: "Slow" });
    expect(replay).toHaveAccessibleDescription("Plays the reply again");
    expect(slow).toHaveAccessibleDescription("Plays the reply again, slowly");

    fireEvent.click(replay);
    fireEvent.click(slow);
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onReplaySlow).toHaveBeenCalledTimes(1);
  });

  it("has no replay buttons when the browser can't speak", () => {
    render(<TutorBubble text="¡Hola!" translation={null} partial={false} canSpeak={false} canReplay onReplay={vi.fn()} onReplaySlow={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Replay" })).not.toBeInTheDocument();
  });

  it("keeps the replay buttons but disables them, saying why, while the microphone is listening", () => {
    const onReplay = vi.fn();
    const onReplaySlow = vi.fn();
    render(
      <TutorBubble text="¡Hola!" translation={null} partial={false} canSpeak canReplay={false} onReplay={onReplay} onReplaySlow={onReplaySlow} />,
    );

    const replay = screen.getByRole("button", { name: "Replay" });
    const slow = screen.getByRole("button", { name: "Slow" });
    expect(replay).toBeDisabled();
    expect(slow).toBeDisabled();
    expect(replay).toHaveAccessibleDescription("Unavailable while the microphone is listening");
    expect(slow).toHaveAccessibleDescription("Unavailable while the microphone is listening");

    fireEvent.click(replay);
    fireEvent.click(slow);
    expect(onReplay).not.toHaveBeenCalled();
    expect(onReplaySlow).not.toHaveBeenCalled();
  });
});
