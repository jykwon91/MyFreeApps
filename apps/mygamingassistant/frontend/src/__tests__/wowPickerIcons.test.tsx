import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import classDetailsJson from "@/games/wow-forever/data/classes/classDetails.json";
import hunterPetsJson from "@/games/wow-forever/data/hunterPets/hunterPets.json";
import racesJson from "@/games/wow-forever/data/races/races.json";
import GoldGatheringSection from "@/games/wow-forever/components/gold/GoldGatheringSection";
import ProfessionPicker from "@/games/wow-forever/components/professions/ProfessionPicker";
import RaceClassChips from "@/games/wow-forever/components/races/RaceClassChips";
import ClassLinkPicker from "@/games/wow-forever/components/shared/ClassLinkPicker";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { WOW_ICONS } from "@/games/wow-forever/data/icons/wowIconData";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";

const TALENT_FILES = import.meta.glob<unknown>("@/games/wow-forever/data/talents/*.json", { eager: true, import: "default" });

/** Every icon file the build published: files named directly, spells, items and skills. */
const PUBLISHED = new Set<number>([
  ...WOW_ICONS.files,
  ...Object.values(WOW_ICONS.spells),
  ...Object.values(WOW_ICONS.items).map(([fileDataId]) => fileDataId),
  ...Object.values(WOW_ICONS.skills),
]);

/** Every non-zero `icon` field anywhere in a generated file (0 = the client has none). */
function iconIds(value: unknown, found: number[] = []): number[] {
  if (Array.isArray(value)) {
    for (const v of value) iconIds(v, found);
  } else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (key === "icon" && typeof v === "number") {
        if (v > 0) found.push(v);
      } else {
        iconIds(v, found);
      }
    }
  }
  return found;
}

describe("the icons pickers and headings name", () => {
  it.each([
    ["classes", classDetailsJson],
    ["races and racials", racesJson],
    ["hunter pet families and abilities", hunterPetsJson],
    ...Object.entries(TALENT_FILES).map(([path, file]) => [`talents ${path.split("/").pop()}`, file] as const),
  ])("every %s icon is published", (_name, file) => {
    const ids = iconIds(file);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !PUBLISHED.has(id))).toEqual([]);
  });
});

describe("SegmentedToggle", () => {
  it("draws an option's icon before its label, and none for an option without one", () => {
    render(
      <SegmentedToggle
        label="Pick"
        options={[
          { id: "a", label: "With icon", icon: fileIcon(626001) },
          { id: "b", label: "Missing icon", icon: null },
          { id: "c", label: "No icon" },
        ]}
        value="a"
        onChange={() => {}}
      />,
    );
    expect(within(screen.getByRole("radio", { name: "With icon" })).getByTestId("game-icon")).toBeInTheDocument();
    expect(within(screen.getByRole("radio", { name: "Missing icon" })).getByTestId("game-icon-placeholder")).toBeInTheDocument();
    expect(within(screen.getByRole("radio", { name: "No icon" })).queryByTestId(/game-icon/)).toBeNull();
  });
});

describe("class and profession pickers", () => {
  it("shows every class with its in-game icon", () => {
    render(
      <MemoryRouter>
        <ClassLinkPicker basePath="/wow-forever/classes" current="mage" testId="picker" />
      </MemoryRouter>,
    );
    const links = within(screen.getByTestId("picker")).getAllByRole("link");
    expect(links).toHaveLength(WOW_CLASSES.length);
    for (const link of links) expect(within(link).getByTestId("game-icon")).toBeInTheDocument();
  });

  it("shows every profession with its in-game icon", () => {
    render(<ProfessionPicker value="tailoring" onChange={() => {}} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(12);
    for (const radio of radios) expect(within(radio).getByTestId("game-icon")).toBeInTheDocument();
  });

  it("shows a race's classes with their icons", () => {
    render(
      <MemoryRouter>
        <RaceClassChips classes={["warrior", "mage"]} newClasses={[]} />
      </MemoryRouter>,
    );
    expect(within(screen.getByTestId("race-classes")).getAllByTestId("game-icon")).toHaveLength(2);
  });

  it("shows each gathering profession's icon on the gold page", () => {
    render(<GoldGatheringSection />);
    expect(screen.getAllByTestId("game-icon")).toHaveLength(3);
  });
});
