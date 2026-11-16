import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_COPY } from "@mylanguagetutor/api-client/constants/catalogCopy";
import type { PracticeScenario } from "@mylanguagetutor/api-client/types/session/practice-scenario";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";
import PracticeLoader from "@/features/session/PracticeLoader";

const refetch = vi.fn();
const sessionMounted = vi.fn();
let scenario: PracticeScenario;

vi.mock("@mylanguagetutor/api-client/hooks/usePracticeScenario", () => ({
  usePracticeScenario: () => scenario,
}));
vi.mock("@/features/session/PracticeSession", async () => {
  const { useEffect } = await import("react");
  function FakePracticeSession() {
    useEffect(() => {
      sessionMounted();
    }, []);
    return <div>conversation in progress</div>;
  }
  return { default: FakePracticeSession };
});

const PROFILE: Profile = { language_code: "es", level: "some_phrases", updated_at: "2026-11-01T00:00:00Z" };
const TARGET: NonNullable<PracticeScenario["target"]> = {
  language: { code: "es", display_name: "Spanish", dialect_label: "Latin American", stt_locale: "es-MX", tts_locale: "es-MX" },
  scenario: { slug: "cafe", title: "At the cafe", goal: "Order a drink.", goals: ["Order"], order: 4 },
};

function loader() {
  return (
    <MemoryRouter>
      <PracticeLoader profile={PROFILE} scenarioSlug="cafe" />
    </MemoryRouter>
  );
}

describe("PracticeLoader", () => {
  beforeEach(() => {
    refetch.mockReset();
    sessionMounted.mockReset();
  });

  it("keeps the conversation on screen when a later refetch of the catalog fails", () => {
    scenario = { target: TARGET, isError: false, error: undefined, refetch };
    const { rerender } = render(loader());
    expect(screen.getByText("conversation in progress")).toBeTruthy();

    scenario = { target: TARGET, isError: true, error: { status: 500 }, refetch };
    rerender(loader());

    expect(screen.getByText("conversation in progress")).toBeTruthy();
    expect(screen.queryByText(CATALOG_COPY.loadFailed)).toBeNull();
    expect(sessionMounted).toHaveBeenCalledTimes(1);
  });

  it("says the catalog can't load, and tries again, when nothing has loaded yet", () => {
    scenario = { target: undefined, isError: true, error: { status: 500 }, refetch };
    render(loader());

    expect(screen.getByText(CATALOG_COPY.loadFailed)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: CATALOG_COPY.retry }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
