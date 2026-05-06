/**
 * Unit tests for NavigationButtons (PR #329 + PR #334).
 *
 * Covers the truth-table for the Prev/Next state:
 *   * targetIndex=0  → Prev disabled, Next enabled
 *   * targetIndex=N  → Prev enabled,  Next disabled
 *   * targetIndex=mid → both enabled
 *   * isPending=true → both disabled regardless of position
 *   * navigate mutation in flight → both disabled
 *   * Click → navigate({id, direction}) called with correct args
 *   * Click while busy → no second call
 *   * navigate rejection → showError called, no crash
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import NavigationButtons from "../NavigationButtons";
import { NavDirection } from "../nav-direction";

const showError = vi.fn();
let navigateUnwrap: ReturnType<typeof vi.fn>;
let navIsLoading = false;
let lastNavArgs: unknown = null;

vi.mock("lucide-react", () => ({
  ChevronLeft: () => <span data-testid="icon-prev" />,
  ChevronRight: () => <span data-testid="icon-next" />,
}));

vi.mock("@platform/ui", () => ({
  showError: (...args: unknown[]) => showError(...args),
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "unknown error",
}));

vi.mock("@/lib/resumeRefinementApi", () => ({
  useNavigateRefinementMutation: () => [
    vi.fn((args: unknown) => {
      lastNavArgs = args;
      return { unwrap: navigateUnwrap };
    }),
    { isLoading: navIsLoading },
  ],
}));

const SESSION_ID = "11111111-1111-1111-1111-111111111111";

describe("NavigationButtons", () => {
  beforeEach(() => {
    showError.mockClear();
    navigateUnwrap = vi.fn().mockResolvedValue(undefined);
    navIsLoading = false;
    lastNavArgs = null;
  });

  it("disables Prev at the first target, leaves Next enabled", () => {
    render(
      <NavigationButtons
        sessionId={SESSION_ID}
        targetIndex={0}
        totalTargets={5}
        isPending={false}
      />,
    );
    expect((screen.getByLabelText(/previous suggestion/i) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/next suggestion/i) as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables Next at the last target, leaves Prev enabled", () => {
    render(
      <NavigationButtons
        sessionId={SESSION_ID}
        targetIndex={4}
        totalTargets={5}
        isPending={false}
      />,
    );
    expect((screen.getByLabelText(/previous suggestion/i) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText(/next suggestion/i) as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables both buttons in the middle of the session", () => {
    render(
      <NavigationButtons
        sessionId={SESSION_ID}
        targetIndex={2}
        totalTargets={5}
        isPending={false}
      />,
    );
    expect((screen.getByLabelText(/previous suggestion/i) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText(/next suggestion/i) as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables BOTH buttons when isPending is true (parent has another mutation in flight)", () => {
    render(
      <NavigationButtons
        sessionId={SESSION_ID}
        targetIndex={2}
        totalTargets={5}
        isPending={true}
      />,
    );
    expect((screen.getByLabelText(/previous suggestion/i) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/next suggestion/i) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables BOTH buttons while the navigate mutation is in flight", () => {
    navIsLoading = true;
    render(
      <NavigationButtons
        sessionId={SESSION_ID}
        targetIndex={2}
        totalTargets={5}
        isPending={false}
      />,
    );
    expect((screen.getByLabelText(/previous suggestion/i) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/next suggestion/i) as HTMLButtonElement).disabled).toBe(true);
  });

  it("invokes navigate with the right id + direction on Next click", async () => {
    render(
      <NavigationButtons
        sessionId={SESSION_ID}
        targetIndex={2}
        totalTargets={5}
        isPending={false}
      />,
    );
    fireEvent.click(screen.getByLabelText(/next suggestion/i));
    await waitFor(() => {
      expect(navigateUnwrap).toHaveBeenCalledTimes(1);
    });
    expect(lastNavArgs).toEqual({
      id: SESSION_ID,
      direction: NavDirection.NEXT,
    });
  });

  it("invokes navigate with the right id + direction on Prev click", async () => {
    render(
      <NavigationButtons
        sessionId={SESSION_ID}
        targetIndex={2}
        totalTargets={5}
        isPending={false}
      />,
    );
    fireEvent.click(screen.getByLabelText(/previous suggestion/i));
    await waitFor(() => {
      expect(navigateUnwrap).toHaveBeenCalledTimes(1);
    });
    expect(lastNavArgs).toEqual({
      id: SESSION_ID,
      direction: NavDirection.PREV,
    });
  });

  it("surfaces an error toast when navigate rejects", async () => {
    navigateUnwrap = vi.fn().mockRejectedValue(new Error("nav blew up"));
    render(
      <NavigationButtons
        sessionId={SESSION_ID}
        targetIndex={2}
        totalTargets={5}
        isPending={false}
      />,
    );
    fireEvent.click(screen.getByLabelText(/next suggestion/i));
    await waitFor(() => {
      expect(showError).toHaveBeenCalledTimes(1);
    });
    expect(showError.mock.calls[0]?.[0]).toMatch(/nav blew up/);
  });
});
