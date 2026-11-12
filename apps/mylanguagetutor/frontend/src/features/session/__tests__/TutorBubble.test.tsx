import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TutorBubble from "@/features/session/TutorBubble";

describe("TutorBubble", () => {
  it("names the replay buttons by what they show, and describes what they do", () => {
    const onReplay = vi.fn();
    const onReplaySlow = vi.fn();
    render(
      <TutorBubble text="¡Hola!" translation={null} partial={false} canSpeak onReplay={onReplay} onReplaySlow={onReplaySlow} />,
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
    render(<TutorBubble text="¡Hola!" translation={null} partial={false} canSpeak={false} onReplay={vi.fn()} onReplaySlow={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Replay" })).not.toBeInTheDocument();
  });
});
