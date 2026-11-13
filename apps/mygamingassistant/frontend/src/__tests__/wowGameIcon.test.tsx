import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import tailoringJson from "@/games/wow-forever/data/professions/crafting/tailoring.json";
import enchantingJson from "@/games/wow-forever/data/professions/crafting/enchanting.json";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import WowLegalNotice from "@/games/wow-forever/components/shared/WowLegalNotice";
import { WOW_ICONS } from "@/games/wow-forever/data/icons/wowIconData";
import { GATHERING_GUIDES } from "@/games/wow-forever/data/professions/gathering/gatheringGuides";
import { classIcon, iconUrl, itemIcon, professionIcon, recipeIcon, spellIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { CraftingFile } from "@/games/wow-forever/types/crafting";
import type { WowIconFile } from "@/games/wow-forever/types/icons/wowIconFile";

const FIXTURE: WowIconFile = {
  source: "fixture",
  build: "1.2.3.4",
  items: { "2840": [133217, 1], "14048": [132905, 2], "99": [10, 42] },
  spells: { "7418": 135913 },
  files: [],
  skills: { "197": 136249 },
};

describe("icon lookups", () => {
  it("gives a profession its skill line's icon, and every profession one in the real map", () => {
    expect(professionIcon("tailoring", FIXTURE)).toEqual({ fileDataId: 136249, quality: null });
    expect(professionIcon("mining", FIXTURE)).toBeNull();
    for (const p of ["alchemy", "blacksmithing", "enchanting", "engineering", "leatherworking", "tailoring", "herbalism", "mining", "skinning", "cooking", "firstaid", "fishing"] as const) {
      expect(professionIcon(p)).not.toBeNull();
    }
  });

  it("gives a class its in-game icon", () => {
    expect(classIcon("mage")).toEqual({ fileDataId: 626001, quality: null });
  });

  it("gives an item its icon and quality name", () => {
    expect(itemIcon(14048, FIXTURE)).toEqual({ fileDataId: 132905, quality: "uncommon" });
  });

  it("gives an unknown quality id no colour", () => {
    expect(itemIcon(99, FIXTURE)).toEqual({ fileDataId: 10, quality: null });
  });

  it("returns null for an item or spell the map lacks", () => {
    expect(itemIcon(1, FIXTURE)).toBeNull();
    expect(spellIcon(1, FIXTURE)).toBeNull();
  });

  it("shows a recipe by the item it makes, an enchant by its spell", () => {
    const made = { spell: 1, creates: { id: 2840, name: "Copper Bar", count: 1, quality: 1 } };
    expect(recipeIcon(made, FIXTURE)?.fileDataId).toBe(133217);
    expect(recipeIcon({ spell: 7418 }, FIXTURE)).toEqual({ fileDataId: 135913, quality: null });
  });

  it("builds the build-pinned, same-origin URL", () => {
    expect(iconUrl(134829, "1.2.3.4")).toBe("/api/wow/icons/1.2.3.4/134829.webp");
  });
});

describe("the committed icon map", () => {
  it("covers every gathering node's item", () => {
    for (const guide of Object.values(GATHERING_GUIDES)) {
      if (guide.kind !== "nodes") continue;
      for (const node of guide.nodes) expect(itemIcon(node.itemId), node.name).not.toBeNull();
    }
  });

  it("covers every recipe and reagent the crafting guides show", () => {
    for (const file of [tailoringJson, enchantingJson] as unknown as CraftingFile[]) {
      for (const recipe of file.recipes) {
        expect(recipeIcon(recipe), recipe.name).not.toBeNull();
        for (const r of recipe.reagents) expect(itemIcon(r.id), r.name).not.toBeNull();
      }
    }
  });

  it("names the build in its source line", () => {
    expect(WOW_ICONS.source).toContain(WOW_ICONS.build);
  });
});

describe("GameIcon", () => {
  const icon = { fileDataId: 134829, quality: "rare" as const };

  it("renders a lazy, sized image with the given alt", () => {
    render(<GameIcon icon={icon} size={32} alt="Linen Cloth" />);
    const img = screen.getByRole("img", { name: "Linen Cloth" });
    expect(img).toHaveAttribute("src", iconUrl(134829));
    expect(img).toHaveAttribute("width", "32");
    expect(img).toHaveAttribute("height", "32");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
  });

  it("is decorative (hidden from assistive tech) with an empty alt", () => {
    render(<GameIcon icon={icon} size={16} alt="" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("game-icon")).toHaveAttribute("aria-hidden", "true");
  });

  it("rings the frame in the item's quality colour", () => {
    render(<GameIcon icon={icon} size={24} alt="" />);
    expect(screen.getByTestId("game-icon").parentElement?.className).toContain("border-blue-600");
  });

  it("shows a same-size placeholder when there is no icon", () => {
    render(<GameIcon icon={null} size={24} alt="" />);
    const box = screen.getByTestId("game-icon-placeholder");
    expect(box).toHaveStyle({ width: "24px", height: "24px" });
    expect(box).toHaveAttribute("aria-hidden", "true");
  });

  it("swaps to the placeholder when the image fails to load", () => {
    render(<GameIcon icon={icon} size={48} alt="Mithril Ore" />);
    fireEvent.error(screen.getByRole("img", { name: "Mithril Ore" }));
    expect(screen.queryByTestId("game-icon")).toBeNull();
    expect(screen.getByRole("img", { name: "Mithril Ore" })).toHaveAttribute("data-testid", "game-icon-placeholder");
  });
});

describe("GameIcon frame options", () => {
  const icon = { fileDataId: 133217, quality: "rare" as const };

  it("keeps a fixed inline size and a 1px frame by default, so other callers do not change", () => {
    render(<GameIcon icon={icon} size={16} alt="" />);
    const frame = screen.getByTestId("game-icon").parentElement as HTMLElement;
    expect(frame.style.width).toBe("16px");
    expect(frame.className.split(" ")).toContain("border");
    expect(frame.className).not.toContain("border-2");
    expect(frame.className).not.toContain("var(--icon");
  });

  it("can switch size at sm and use a 2px frame, on the icon and on its placeholder", () => {
    render(<GameIcon icon={icon} size={48} smSize={40} thickBorder alt="" />);
    render(<GameIcon icon={null} size={48} smSize={40} thickBorder alt="" />);
    for (const frame of [screen.getByTestId("game-icon").parentElement as HTMLElement, screen.getByTestId("game-icon-placeholder")]) {
      expect(frame.getAttribute("style")).toContain("--icon-size: 48px");
      expect(frame.getAttribute("style")).toContain("--icon-sm-size: 40px");
      expect(frame.className).toContain("border-2");
      expect(frame.className).toContain("sm:w-[var(--icon-sm-size)]");
    }
  });
});

describe("WowLegalNotice", () => {
  it("credits Blizzard and disclaims affiliation", () => {
    render(<WowLegalNotice />);
    const text = screen.getByTestId("wow-legal-notice").textContent ?? "";
    expect(text).toContain("World of Warcraft® and Blizzard Entertainment®");
    expect(text).toContain("Not affiliated with or endorsed by Blizzard.");
  });
});
