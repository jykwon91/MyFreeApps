// @vitest-environment jsdom
// renderHook needs a DOM; the package's own code still runs DOM-free in every other test.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REFINEMENT_TOASTS } from "../constants/refinementToasts";
import { useRefinementProposal } from "../hooks/useRefinementProposal";
import { SuggestionMode } from "../types/resume-refinement/suggestion-mode";

type Trigger = ReturnType<typeof vi.fn>;

const api = vi.hoisted(() => {
  function mutation() {
    return { trigger: vi.fn(), state: { isLoading: false } };
  }
  return {
    accept: mutation(),
    flagged: mutation(),
    custom: mutation(),
    alternative: mutation(),
    skip: mutation(),
  };
});

vi.mock("../store/resumeRefinementApi", () => ({
  useAcceptPendingMutation: () => [api.accept.trigger, api.accept.state],
  useAcceptFlaggedMutation: () => [api.flagged.trigger, api.flagged.state],
  useSupplyCustomRewriteMutation: () => [api.custom.trigger, api.custom.state],
  useRequestAlternativeMutation: () => [api.alternative.trigger, api.alternative.state],
  useSkipTargetMutation: () => [api.skip.trigger, api.skip.state],
}));

function resolves(trigger: Trigger): void {
  trigger.mockReturnValue({ unwrap: () => Promise.resolve({}) });
}

function rejects(trigger: Trigger, error: unknown): void {
  trigger.mockReturnValue({ unwrap: () => Promise.reject(error) });
}

function setup(turnCount = 2) {
  const onSuccess = vi.fn();
  const onError = vi.fn();
  const hook = renderHook(({ count }) => useRefinementProposal({ id: "s1", turn_count: count }, { onSuccess, onError }), {
    initialProps: { count: turnCount },
  });
  return { ...hook, onSuccess, onError };
}

describe("useRefinementProposal", () => {
  beforeEach(() => {
    for (const { trigger, state } of Object.values(api)) {
      trigger.mockReset();
      resolves(trigger);
      state.isLoading = false;
    }
  });

  it("accepts the suggestion and says so", async () => {
    const { result, onSuccess } = setup();
    await act(() => result.current.accept());
    expect(api.accept.trigger).toHaveBeenCalledWith("s1");
    expect(onSuccess).toHaveBeenCalledWith(REFINEMENT_TOASTS.applied);
  });

  it("submits a trimmed custom rewrite, then closes and empties the editor", async () => {
    const { result, onSuccess } = setup();
    act(() => {
      result.current.openCustom();
      result.current.setCustomText("  My words  ");
    });
    expect(result.current.mode).toBe(SuggestionMode.CUSTOM);
    await act(() => result.current.submitCustom());
    expect(api.custom.trigger).toHaveBeenCalledWith({ id: "s1", user_text: "My words" });
    expect(onSuccess).toHaveBeenCalledWith(REFINEMENT_TOASTS.customApplied);
    expect(result.current.mode).toBe(SuggestionMode.VIEW);
    expect(result.current.customText).toBe("");
  });

  it("does not send a blank rewrite or message", async () => {
    const { result } = setup();
    act(() => result.current.setComposerText("   "));
    await act(() => result.current.submitCustom());
    await act(() => result.current.send());
    expect(api.custom.trigger).not.toHaveBeenCalled();
    expect(api.alternative.trigger).not.toHaveBeenCalled();
  });

  it("keeps the custom text when the rewrite fails", async () => {
    const error = { status: 429 };
    rejects(api.custom.trigger, error);
    const { result, onError, onSuccess } = setup();
    act(() => {
      result.current.openCustom();
      result.current.setCustomText("Mine");
    });
    await act(() => result.current.submitCustom());
    expect(onError).toHaveBeenCalledWith(error);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.mode).toBe(SuggestionMode.CUSTOM);
    expect(result.current.customText).toBe("Mine");
  });

  it("echoes a sent message until the new turn arrives", async () => {
    const { result, rerender } = setup(2);
    act(() => result.current.setComposerText(" shorter please "));
    await act(() => result.current.send());
    expect(api.alternative.trigger).toHaveBeenCalledWith({ id: "s1", hint: "shorter please" });
    expect(result.current.composerText).toBe("");
    expect(result.current.pendingEcho).toBe("shorter please");

    rerender({ count: 2 });
    expect(result.current.pendingEcho).toBe("shorter please");
    rerender({ count: 4 });
    expect(result.current.pendingEcho).toBeNull();
  });

  it("puts a failed message back in the box", async () => {
    const error = { status: 502 };
    rejects(api.alternative.trigger, error);
    const { result, onError } = setup();
    act(() => result.current.setComposerText("shorter"));
    await act(() => result.current.send());
    expect(onError).toHaveBeenCalledWith(error);
    expect(result.current.composerText).toBe("shorter");
    expect(result.current.pendingEcho).toBeNull();
  });

  it("asks for another take without a hint, skips, and accepts what the guard held", async () => {
    const { result, onSuccess } = setup();
    act(() => result.current.setComposerText("draft"));
    await act(() => result.current.regenerate());
    expect(api.alternative.trigger).toHaveBeenCalledWith({ id: "s1", hint: undefined });
    await act(() => result.current.skip());
    expect(api.skip.trigger).toHaveBeenCalledWith("s1");
    await act(() => result.current.forceAccept());
    expect(api.flagged.trigger).toHaveBeenCalledWith("s1");
    expect(onSuccess).toHaveBeenCalledWith(REFINEMENT_TOASTS.applied);
    expect(result.current.composerText).toBe("");
  });

  it("is busy while any action or a sibling action is in flight", () => {
    api.skip.state.isLoading = true;
    const { result } = setup();
    expect(result.current.isPending).toBe(true);
    expect(result.current.isSkipping).toBe(true);

    api.skip.state.isLoading = false;
    const external = renderHook(() =>
      useRefinementProposal({ id: "s1", turn_count: 0 }, { onSuccess: vi.fn(), onError: vi.fn(), externalPending: true }),
    );
    expect(external.result.current.isPending).toBe(true);
    expect(external.result.current.isRegenerating).toBe(true);
  });
});
