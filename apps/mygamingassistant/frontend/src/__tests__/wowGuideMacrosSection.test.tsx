import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import MacrosSection from "@/games/wow-forever/components/guide/MacrosSection";
import { CLASS_MACROS } from "@/games/wow-forever/data/guide/classMacros";
import { MOUSEOVER_TEMPLATES } from "@/games/wow-forever/data/guide/macroTemplates";

const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock("@platform/ui", async (importOriginal) => ({ ...(await importOriginal<object>()), ...toast }));

function renderSection() {
  return render(
    <MemoryRouter>
      <MacrosSection />
    </MemoryRouter>,
  );
}

describe("Guide Macros section", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("shows the how-to, every template and every ready-made macro", () => {
    renderSection();
    expect(screen.getByRole("heading", { name: "Macros", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How to make a macro" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(MOUSEOVER_TEMPLATES.length + CLASS_MACROS.length);
    expect(screen.getByRole("link", { name: "More Warlock macros" })).toHaveAttribute("href", "/wow-forever/warlock-macros");
  });

  it("shows the placeholder until a spell is typed, then fills every template live", async () => {
    const user = userEvent.setup();
    renderSection();
    const friendly = screen.getByRole("article", { name: "Friendly mouseover" });
    expect(within(friendly).getByTestId("macro-text")).toHaveTextContent("[@player] Spell Name");

    await user.type(screen.getByLabelText("Your spell name"), "Flash Heal");
    expect(within(friendly).getByTestId("macro-text").textContent).toBe(
      "#showtooltip\n/cast [@mouseover,help,nodead][help,nodead][@player] Flash Heal",
    );
    const enemy = screen.getByRole("article", { name: "Enemy mouseover" });
    expect(within(enemy).getByTestId("macro-text").textContent).toBe("#showtooltip\n/cast [@mouseover,harm,nodead][] Flash Heal");

    await user.clear(screen.getByLabelText("Your spell name"));
    expect(within(friendly).getByTestId("macro-text")).toHaveTextContent("Spell Name");
  });

  it("copies the filled-in template and says so", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.type(screen.getByLabelText("Your spell name"), "Renew");
    await user.click(screen.getByRole("button", { name: "Copy macro: Mouseover only" }));
    expect(await navigator.clipboard.readText()).toBe("#showtooltip\n/cast [@mouseover,exists,nodead] Renew");
    expect(toast.showSuccess).toHaveBeenCalledWith('Copied "Mouseover only"');
    expect(screen.getByRole("button", { name: "Copy macro: Mouseover only" })).toHaveTextContent("Copied");
  });

  it("copies a ready-made class macro", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole("button", { name: "Copy macro: Rejuvenation (Druid)" }));
    expect(await navigator.clipboard.readText()).toBe(
      "#showtooltip\n/cast [@mouseover,help,nodead][help,nodead][@player] Rejuvenation",
    );
  });
});
