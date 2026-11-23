import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TurnErrorAlert from "@/features/session/TurnErrorAlert";

describe("TurnErrorAlert", () => {
  it("puts its buttons outside any alert, so they aren't read as part of the message", () => {
    const { container } = render(<TurnErrorAlert failure={{ code: "tutor_busy", text: "hola", retryable: true, entryKey: null }} onRetry={vi.fn()} onDismiss={vi.fn()} />);

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });
});
