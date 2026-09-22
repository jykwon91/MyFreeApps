import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WowComparePage from "@/games/wow-forever/pages/WowComparePage";
import { COMPARE_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/useCompareSettings";

// Screenshot is the default input; this flow switches to local text parsing.
vi.mock("@/games/wow-forever/api/wowItemsApi", () => ({
  useExtractItemMutation: () => [vi.fn(), { isLoading: false }],
}));

async function pasteInto(position: number, text: string) {
  const card = screen.getByRole("article", { name: new RegExp(`^Item ${position}:`) });
  await userEvent.click(within(card).getByRole("radio", { name: "Paste from a website" }));
  await userEvent.click(within(card).getByRole("textbox", { name: /tooltip text/i }));
  await userEvent.paste(text);
  await userEvent.click(within(card).getByRole("button", { name: "Read text" }));
}

describe("WoW Forever Item Compare page", () => {
  beforeEach(() => window.localStorage.clear());

  it("opens each item on the screenshot reader, with pasting text as the alternative", () => {
    render(
      <MemoryRouter>
        <WowComparePage />
      </MemoryRouter>,
    );
    const card = screen.getByRole("article", { name: /^Item 1:/ });
    expect(within(card).getByRole("radio", { name: "Screenshot" })).toHaveAttribute("aria-checked", "true");
    expect(within(card).getByRole("radio", { name: "Paste from a website" })).toHaveAttribute("aria-checked", "false");
    expect(within(card).getByRole("button", { name: "Read screenshot" })).toBeInTheDocument();
  });

  it("compares two pasted items and explains the winner", async () => {
    window.localStorage.setItem(
      COMPARE_SETTINGS_STORAGE_KEY,
      JSON.stringify({ classId: "warrior", specId: "arms", bracket: "level60", currentHitPct: null }),
    );
    render(
      <MemoryRouter>
        <WowComparePage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/add stats to at least two items/i)).toBeInTheDocument();
    expect(screen.getByText(/stat values aren't published yet/i)).toBeInTheDocument();

    await pasteInto(1, "Strong Helm\n+20 Strength\n+5 Intellect");
    await pasteInto(2, "Sturdy Helm\n+5 Strength\n+10 Stamina");

    expect(screen.getByRole("heading", { name: "Strong Helm is the better pick" })).toBeInTheDocument();
    expect(screen.getByText(/ahead mostly on Strength/)).toBeInTheDocument();
    expect(screen.getAllByText(/not scored/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Pawn Classic Era scale — Arms Warrior/)).toBeInTheDocument();
  }, 20_000);
});
