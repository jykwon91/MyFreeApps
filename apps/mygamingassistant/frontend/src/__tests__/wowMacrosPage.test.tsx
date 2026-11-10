import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import WowMacrosPage from "@/games/wow-forever/pages/WowMacrosPage";
import { MACRO_CLASS_STORAGE_KEY } from "@/games/wow-forever/data/macros/macroClassFilter";
import { MOUSEOVER_TEMPLATES } from "@/games/wow-forever/data/macros/macroTemplates";
import { ALL_MACROS } from "@/games/wow-forever/lib/macros/macroCatalog";

const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock("@platform/ui", async (importOriginal) => ({ ...(await importOriginal<object>()), ...toast }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderPage(url = "/wow-forever/macros") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/wow-forever/macros"
          element={
            <>
              <WowMacrosPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const sectionHeadings = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
const classHeadings = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent).filter((t) => t !== "Good to know" && t !== "Make your own, for any class" && t !== "Tag macro");

describe("Macros page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("puts the how-to first, then hover cast as the first macro section, then tagging, then every class's macros", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Macros", level: 1 })).toBeInTheDocument();
    expect(sectionHeadings()).toEqual(["How to make a macro", "Hover-cast macros (mouseover)", "Tag a mob first", "Ready-made macros by class"]);
    expect(screen.getByText("A hover-cast macro casts on whoever your mouse is over, without changing your target.")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(MOUSEOVER_TEMPLATES.length + 1 + ALL_MACROS.length);
    expect(classHeadings()).toEqual(["Druid", "Hunter", "Mage", "Paladin", "Priest", "Rogue", "Shaman", "Warlock", "Warrior"]);
  });

  it("lists each class's hover-cast macros first, labelled Hover cast", () => {
    renderPage();
    const warlock = screen.getByRole("region", { name: "Warlock" });
    const kinds = within(warlock).getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(kinds[0]).toBe("Hover cast");
    expect(kinds).toContain("Pet");
    const hover = within(warlock).getByRole("region", { name: "Hover cast" });
    expect(within(hover).getByRole("article", { name: "Corruption (Warlock)" })).toBeInTheDocument();
    expect(within(hover).getByRole("article", { name: "Devour Magic on mouseover" })).toBeInTheDocument();
  });

  it("filters to one class, remembers it and puts it in the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("radio", { name: "Priest" }));
    expect(classHeadings()).toEqual(["Priest"]);
    expect(screen.getByTestId("location")).toHaveTextContent("/wow-forever/macros?class=priest");
    expect(JSON.parse(window.localStorage.getItem(MACRO_CLASS_STORAGE_KEY) ?? "null")).toBe("priest");

    await user.click(screen.getByRole("radio", { name: "All classes" }));
    expect(classHeadings()).toHaveLength(9);
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/wow-forever\/macros$/);
  });

  it("opens on the class in the URL, else the last class picked", () => {
    const { unmount } = renderPage("/wow-forever/macros?class=warlock");
    expect(screen.getByRole("radio", { name: "Warlock" })).toHaveAttribute("aria-checked", "true");
    expect(classHeadings()).toEqual(["Warlock"]);
    unmount();

    window.localStorage.setItem(MACRO_CLASS_STORAGE_KEY, JSON.stringify("mage"));
    renderPage();
    expect(classHeadings()).toEqual(["Mage"]);
  });

  it("goes back to every class from a remembered class, though the URL has no class to drop", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(MACRO_CLASS_STORAGE_KEY, JSON.stringify("mage"));
    renderPage();
    await user.click(screen.getByRole("radio", { name: "All classes" }));
    expect(classHeadings()).toHaveLength(9);
    expect(JSON.parse(window.localStorage.getItem(MACRO_CLASS_STORAGE_KEY) ?? "null")).toBe("all");
  });

  it("marks unconfirmed syntax and confirms client names", () => {
    renderPage("/wow-forever/macros?class=warlock");
    const focus = screen.getByRole("article", { name: "Fear your focus" });
    expect(within(focus).getByText("Unconfirmed")).toBeInTheDocument();
    const create = screen.getByRole("article", { name: "Create a Healthstone" });
    expect(within(create).queryByText("Unconfirmed")).not.toBeInTheDocument();
    expect(within(create).getByText(/Names checked against the Forever client: Create Healthstone/)).toBeInTheDocument();
  });

  it("fills every template live from the spell box, and copies it", async () => {
    const user = userEvent.setup();
    renderPage();
    const friendly = screen.getByRole("article", { name: "Hover cast on a friend" });
    expect(within(friendly).getByTestId("macro-text")).toHaveTextContent("[@player] Spell Name");

    await user.type(screen.getByLabelText("Your spell name"), "Flash Heal");
    expect(within(friendly).getByTestId("macro-text").textContent).toBe(
      "#showtooltip\n/cast [@mouseover,help,nodead][help,nodead][@player] Flash Heal",
    );
    await user.click(screen.getByRole("button", { name: "Copy macro: Hover cast only" }));
    expect(await navigator.clipboard.readText()).toBe("#showtooltip\n/cast [@mouseover,exists,nodead] Flash Heal");
    expect(toast.showSuccess).toHaveBeenCalledWith('Copied "Hover cast only"');
  });

  it("copies a macro and says so", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Copy macro: Life Tap" }));
    expect(await navigator.clipboard.readText()).toBe("/cast Life Tap");
    expect(toast.showSuccess).toHaveBeenCalledWith('Copied "Life Tap"');
    expect(screen.getByRole("button", { name: "Copy macro: Life Tap" })).toHaveTextContent("Copied");
  });

  it("says so when the clipboard refuses", async () => {
    const user = userEvent.setup();
    renderPage();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    await user.click(screen.getByRole("button", { name: "Copy macro: Life Tap" }));
    expect(toast.showError).toHaveBeenCalled();
    expect(toast.showSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Copy macro: Life Tap" })).toHaveTextContent("Copy");
  });
});

describe("Macros page: tag a mob first", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  const tagMacro = () => within(screen.getByRole("article", { name: "Tag macro" })).getByTestId("macro-text");

  it("turns a pasted mob name into a Corruption macro that targets it by its exact name", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(tagMacro()).toHaveTextContent("/targetexact Mob Name");
    await user.click(screen.getByTestId("tag-mob-names"));
    await user.paste("  Lord Gregor   Lescovar ");
    expect(tagMacro().textContent).toBe(
      "#showtooltip Corruption\n/cleartarget\n/targetexact Lord Gregor Lescovar\n/stopmacro [noexists][dead]\n/cast Corruption",
    );
    expect(screen.getByText(/^Targets Lord Gregor Lescovar by its exact name and casts Corruption on it\./)).toBeInTheDocument();
  });

  it("takes several mobs, another spell and an optional skull, and copies the macro", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderPage();
    await user.click(screen.getByTestId("tag-mob-names"));
    await user.paste("Marzon the Silent Blade\nLord Gregor Lescovar");
    await user.clear(screen.getByTestId("tag-spell"));
    await user.type(screen.getByTestId("tag-spell"), "Immolate");
    await user.click(screen.getByRole("checkbox", { name: /Put a skull on it too/ }));
    const text =
      "#showtooltip Immolate\n/cleartarget\n/targetexact Marzon the Silent Blade\n/targetexact Lord Gregor Lescovar\n/stopmacro [noexists][dead]\n/script SetRaidTarget(\"target\",8)\n/cast Immolate";
    expect(tagMacro().textContent).toBe(text);
    await user.click(screen.getByRole("button", { name: "Copy macro: Tag macro" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(text);
  });

  it("warns when the names don't fit in one macro", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId("tag-mob-names"));
    await user.paste(["Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "Cccccccccccccccccccccccccccccccccccccccccccccccccc", "Dddddddddddddddddddddddddddddddddddddddddddddddddd"].join("\n"));
    expect(screen.getByText(/^Too long for one macro \(\d+ of 255 characters\)\. Remove a name, or the skull\.$/)).toBeInTheDocument();
  });
});
