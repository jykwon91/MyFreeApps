import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_COPY } from "@mylanguagetutor/api-client/constants/catalogCopy";
import { SESSION_BLOCK_COPY } from "@mylanguagetutor/api-client/constants/sessionBlockCopy";
import type { Language } from "@mylanguagetutor/api-client/types/catalog/language";
import type { Scenario } from "@mylanguagetutor/api-client/types/catalog/scenario";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";
import type { UsageToday } from "@mylanguagetutor/api-client/types/tutor/usage-today";
import {
  CATALOG_HEADER,
  CATALOG_HEADER_LINE,
  CATALOG_TOUCH_ROW,
  SCENARIO_CARD_BOX,
  SCENARIO_LIST,
  SCENARIO_SKELETON_ROWS,
  TWO_TEXT_LINES,
} from "@/constants/catalogLayout";
import ScenarioPath from "@/features/catalog/ScenarioPath";

const refetchLanguages = vi.fn();
const refetchScenarios = vi.fn();
const refetchUsage = vi.fn();
let languages: { data: Language[] | undefined; isError: boolean };
let scenarios: { data: Scenario[] | undefined; isError: boolean };
let usage: UsageToday | undefined;

vi.mock("@mylanguagetutor/api-client/store/catalogApi", () => ({
  useListLanguagesQuery: () => ({ ...languages, error: undefined, refetch: refetchLanguages }),
  useListScenariosQuery: () => ({ ...scenarios, error: undefined, refetch: refetchScenarios }),
}));
vi.mock("@mylanguagetutor/api-client/store/usageApi", () => ({
  useGetUsageTodayQuery: () => ({ data: usage, refetch: refetchUsage }),
}));

const PROFILE: Profile = { language_code: "es", level: "some_phrases", updated_at: "2026-11-01T00:00:00Z" };
const SPANISH: Language = {
  code: "es",
  display_name: "Spanish",
  dialect_label: "Latin American",
  stt_locale: "es-MX",
  tts_locale: "es-MX",
};
const SCENARIOS: Scenario[] = [
  { slug: "greetings", title: "Greetings", goal: "Say hello and introduce yourself.", goals: ["Greet"], order: 1 },
  { slug: "cafe", title: "At the cafe", goal: "Order a drink and a snack.", goals: ["Order"], order: 4 },
];

function renderPath() {
  return render(
    <MemoryRouter>
      <ScenarioPath profile={PROFILE} />
    </MemoryRouter>,
  );
}

describe("ScenarioPath", () => {
  beforeEach(() => {
    for (const refetch of [refetchLanguages, refetchScenarios, refetchUsage]) refetch.mockReset();
    languages = { data: [SPANISH], isError: false };
    scenarios = { data: SCENARIOS, isError: false };
    usage = { remaining_fraction: 0.6, cap_reached: false, tutor_available: true };
  });

  it("shows a placeholder until the scenarios load", () => {
    scenarios = { data: undefined, isError: false };
    renderPath();
    const skeleton = screen.getByLabelText("Loading scenarios");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    // Its boxes are the loaded page's (catalogLayout), so nothing moves when the path arrives.
    const [header, list] = Array.from(skeleton.children);
    expect(header).toHaveClass(CATALOG_HEADER);
    expect(header.children).toHaveLength(3);
    const [, levelLine, pickLine] = Array.from(header.children);
    expect(levelLine).toHaveClass(CATALOG_HEADER_LINE);
    expect(levelLine.firstElementChild).toHaveClass(CATALOG_TOUCH_ROW);
    // The pick line wraps on a phone and beside the sidebar, so two lines are held for it.
    expect(pickLine).toHaveClass(TWO_TEXT_LINES);
    expect(list).toHaveClass(SCENARIO_LIST);
    const rows = within(list as HTMLElement).getAllByRole("listitem");
    expect(rows).toHaveLength(SCENARIO_SKELETON_ROWS);
    for (const row of rows) expect(row).toHaveClass(SCENARIO_CARD_BOX);
  });

  it("lists the scenarios for the learner's language, with their level and a way to change it", () => {
    renderPath();

    expect(screen.getByRole("heading", { name: "Practice Spanish" })).toBeInTheDocument();
    expect(screen.getByText(/Level: I know some phrases/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: CATALOG_COPY.changeLevel })).toHaveAttribute("href", "/onboarding/level?language=es");
    expect(screen.getByRole("link", { name: /At the cafe/ })).toHaveAttribute("href", "/practice?scenario=cafe");
    expect(screen.queryByText(SESSION_BLOCK_COPY.daily_limit)).not.toBeInTheDocument();
  });

  it("says when today's practice is used up, and still lists the scenarios", () => {
    usage = { remaining_fraction: 0, cap_reached: true, tutor_available: true };
    renderPath();

    expect(screen.getByText(SESSION_BLOCK_COPY.daily_limit)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Greetings/ })).toBeInTheDocument();
  });

  it("says when the scenarios can't load, and tries the catalog and usage again", () => {
    scenarios = { data: undefined, isError: true };
    renderPath();

    expect(screen.getByText(CATALOG_COPY.loadFailed)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: CATALOG_COPY.retry }));
    expect(refetchLanguages).toHaveBeenCalledTimes(1);
    expect(refetchScenarios).toHaveBeenCalledTimes(1);
    expect(refetchUsage).toHaveBeenCalledTimes(1);
  });
});
