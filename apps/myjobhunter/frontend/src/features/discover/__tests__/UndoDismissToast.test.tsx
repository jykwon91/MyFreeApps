/**
 * Unit tests for UndoDismissToast.
 *
 * Note: Radix UI toast components use pointer-capture internally, which JSDOM
 * does not implement (hasPointerCapture is missing). To work around this, tests
 * that need to simulate a click on the Undo button use fireEvent.click (which
 * bypasses the pointer-capture path that userEvent.click triggers) and suppress
 * the resulting jsdom error by adding the method to the prototype.
 *
 * Verifies:
 * - The toast renders when open=true
 * - The toast is hidden when open=false
 * - Clicking Undo fires the mutation with the correct jobId
 * - The toast is closed after a successful undo (onOpenChange called with false)
 */
import { describe, expect, it, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as Toast from "@radix-ui/react-toast";
import UndoDismissToast from "../UndoDismissToast";

// Polyfill hasPointerCapture for JSDOM so Radix Toast doesn't throw.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => undefined;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
});

const mockUndoFn = vi.fn();

vi.mock("@/store/discoverApi", () => ({
  useUndoDismissDiscoveredJobMutation: () => [
    mockUndoFn,
    { isLoading: false },
  ],
}));

vi.mock("@platform/ui", () => ({
  showError: vi.fn(),
  extractErrorMessage: vi.fn((err) => String(err)),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyChildren = { children: any };

function Wrapper({ children }: AnyChildren) {
  return (
    <Toast.Provider>
      {children}
      <Toast.Viewport />
    </Toast.Provider>
  );
}

describe("UndoDismissToast", () => {
  it("renders the toast and Undo button when open", () => {
    render(
      <Wrapper>
        <UndoDismissToast jobId="job-1" open={true} onOpenChange={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByTestId("undo-dismiss-toast")).toBeInTheDocument();
    expect(screen.getByText("Dismissed.")).toBeInTheDocument();
    expect(screen.getByTestId("undo-dismiss-button")).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    render(
      <Wrapper>
        <UndoDismissToast jobId="job-1" open={false} onOpenChange={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByTestId("undo-dismiss-toast")).toBeNull();
  });

  it("calls undoDismiss mutation with the correct jobId on Undo click", async () => {
    mockUndoFn.mockReturnValue({ unwrap: () => Promise.resolve() });
    const onOpenChange = vi.fn();

    render(
      <Wrapper>
        <UndoDismissToast jobId="job-abc" open={true} onOpenChange={onOpenChange} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId("undo-dismiss-button"));
    // Allow async state to settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(mockUndoFn).toHaveBeenCalledWith("job-abc");
  });

  it("calls onOpenChange(false) after a successful undo", async () => {
    mockUndoFn.mockReturnValue({ unwrap: () => Promise.resolve() });
    const onOpenChange = vi.fn();

    render(
      <Wrapper>
        <UndoDismissToast jobId="job-1" open={true} onOpenChange={onOpenChange} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId("undo-dismiss-button"));
    await new Promise((r) => setTimeout(r, 0));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
