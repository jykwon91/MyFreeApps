/** A member's name on the guild page opens their character page, whose back arrow returns to that exact guild URL. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GUILD_BACK_LABEL } from "@/games/wow-forever/data/guild/guildConfig";
import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import WowCharacterPage from "@/games/wow-forever/pages/WowCharacterPage";

const mockQuery = vi.fn();
vi.mock("@/games/wow-forever/api/wowCharacterApi", () => ({
  useGetCharacterQuery: (slug: string, opts: { skip: boolean }) => mockQuery(slug, opts),
}));

const MEMBER = { slug: "tiny-john", name: "Tiny", surname: "John", class_name: "Mage" };
const GUILD_URL = "/wow-forever/topdeadcenter?tab=roster&q=ti";

function renderAt(entry: string | { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/wow-forever/topdeadcenter" element={<GuildMemberLink member={MEMBER} />} />
        <Route path="/wow-forever/character" element={<WowCharacterPage />} />
        <Route path="/wow-forever/character/:slug" element={<WowCharacterPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function backLink(): HTMLElement {
  return screen.getByRole("link", { name: /^Back to / });
}

beforeEach(() => {
  window.localStorage.clear();
  mockQuery.mockReturnValue({ data: undefined, error: undefined, isFetching: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("character page back arrow", () => {
  it("returns to the exact guild URL the member was opened from", () => {
    renderAt(GUILD_URL);
    fireEvent.click(screen.getByRole("link", { name: "Tiny John" }));
    expect(backLink()).toHaveAttribute("href", GUILD_URL);
    expect(backLink()).toHaveAccessibleName(/topdeadcenter/);
  });

  it("keeps returning to the guild after looking up another character", () => {
    renderAt(GUILD_URL);
    fireEvent.click(screen.getByRole("link", { name: "Tiny John" }));
    fireEvent.change(screen.getByLabelText(/character name/i), { target: { value: "Big Sue" } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(mockQuery).toHaveBeenLastCalledWith("big-sue", { skip: false });
    expect(backLink()).toHaveAttribute("href", GUILD_URL);
  });

  it("keeps returning to the guild when the bare page redirects to the last-looked-up character", () => {
    window.localStorage.setItem("mga.wowForever.character.v1", JSON.stringify(["big-sue"]));
    renderAt({ pathname: "/wow-forever/character", state: { backTo: GUILD_URL, backLabel: GUILD_BACK_LABEL } });
    expect(backLink()).toHaveAttribute("href", GUILD_URL);
  });

  it("ignores a back link that points outside the app", () => {
    renderAt({ pathname: "/wow-forever/character/tiny-john", state: { backTo: "https://evil.example", backLabel: "Back" } });
    expect(backLink()).toHaveAttribute("href", "/wow-forever");
  });

  it("goes to WoW Forever when the page is opened directly", () => {
    renderAt("/wow-forever/character/tiny-john");
    expect(backLink()).toHaveAttribute("href", "/wow-forever");
    expect(backLink()).toHaveAccessibleName("Back to WoW Forever");
  });
});
