import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WowWarlockMacrosPage from "@/games/wow-forever/pages/WowWarlockMacrosPage";
import { WARLOCK_MACROS } from "@/games/wow-forever/data/warlock/warlockMacros";

const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock("@platform/ui", async (importOriginal) => ({ ...(await importOriginal<object>()), ...toast }));

function renderPage() {
  return render(
    <MemoryRouter>
      <WowWarlockMacrosPage />
    </MemoryRouter>,
  );
}

describe("Warlock macros page", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("shows a skeleton, then every macro in a card", async () => {
    renderPage();
    expect(screen.getByLabelText("Loading macros")).toBeInTheDocument();
    expect(await screen.findAllByRole("article")).toHaveLength(WARLOCK_MACROS.length);
    expect(screen.queryByLabelText("Loading macros")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How to make a macro" })).toBeInTheDocument();
  });

  it("marks unconfirmed syntax and confirms client names", async () => {
    renderPage();
    const focus = await screen.findByRole("article", { name: "Fear your focus" });
    expect(within(focus).getByText("Unconfirmed")).toBeInTheDocument();
    const create = screen.getByRole("article", { name: "Create a Healthstone" });
    expect(within(create).queryByText("Unconfirmed")).not.toBeInTheDocument();
    expect(within(create).getByText(/Names checked against the Forever client: Create Healthstone/)).toBeInTheDocument();
  });

  it("copies a macro and says so", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByRole("article");
    await user.click(screen.getByRole("button", { name: "Copy macro: Life Tap" }));
    expect(await navigator.clipboard.readText()).toBe("/cast Life Tap");
    expect(toast.showSuccess).toHaveBeenCalledWith('Copied "Life Tap"');
    expect(screen.getByRole("button", { name: "Copy macro: Life Tap" })).toHaveTextContent("Copied");
  });

  it("says so when the clipboard refuses", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByRole("article");
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    await user.click(screen.getByRole("button", { name: "Copy macro: Life Tap" }));
    expect(toast.showError).toHaveBeenCalled();
    expect(toast.showSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Copy macro: Life Tap" })).toHaveTextContent("Copy");
  });
});
