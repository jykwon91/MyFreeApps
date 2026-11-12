// @vitest-environment jsdom
// renderHook needs a DOM; the package's own code still runs DOM-free in every other test.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDraftLinePicker } from "../hooks/useDraftLinePicker";
import type { RefinementSession } from "../types/resume-refinement/refinement-session";
import { improvementTarget, refinementSession } from "./support/refinementSession";

const api = vi.hoisted(() => ({ trigger: vi.fn(), state: { isLoading: false } }));

vi.mock("../store/resumeRefinementApi", () => ({
  useCreateTargetFromLineMutation: () => [api.trigger, api.state],
}));

function setup(session: RefinementSession = refinementSession()) {
  const onError = vi.fn();
  const hook = renderHook(({ current }) => useDraftLinePicker(current, onError), { initialProps: { current: session } });
  return { ...hook, onError };
}

describe("useDraftLinePicker", () => {
  beforeEach(() => {
    api.trigger.mockReset();
    api.trigger.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    api.state.isLoading = false;
  });

  it("highlights the picked line at once, until the session's target is that line", async () => {
    const { result, rerender } = setup();
    expect(result.current.highlightText).toBe("Built APIs");

    let picked = false;
    await act(async () => {
      picked = await result.current.pick({ text: "**Led** a team", section: "Experience" });
    });
    expect(picked).toBe(true);
    expect(api.trigger).toHaveBeenCalledWith({ id: "s1", current_text: "**Led** a team", section: "Experience" });
    expect(result.current.highlightText).toBe("**Led** a team");

    const moved = refinementSession({
      improvement_targets: [improvementTarget(), improvementTarget({ current_text: "Led a team", origin: "user" })],
      target_index: 1,
    });
    rerender({ current: moved });
    expect(result.current.highlightText).toBe("Led a team");
  });

  it("drops back to the session's target and reports a failed pick", async () => {
    const error = { status: 429 };
    api.trigger.mockReturnValue({ unwrap: () => Promise.reject(error) });
    const { result, onError } = setup();
    let picked = true;
    await act(async () => {
      picked = await result.current.pick({ text: "Led a team", section: "Experience" });
    });
    expect(picked).toBe(false);
    expect(onError).toHaveBeenCalledWith(error);
    expect(result.current.highlightText).toBe("Built APIs");
  });

  it("ignores a second pick while one is running", async () => {
    api.state.isLoading = true;
    const { result } = setup();
    let picked = true;
    await act(async () => {
      picked = await result.current.pick({ text: "Led a team", section: "Experience" });
    });
    expect(picked).toBe(false);
    expect(api.trigger).not.toHaveBeenCalled();
    expect(result.current.isPicking).toBe(true);
  });
});
