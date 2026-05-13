/**
 * Unit tests for DesktopBadge.
 *
 * Coverage:
 *  - Web build (no Tauri injection): renders nothing.
 *  - Desktop build (Tauri injected + invoke mocked): shows version + build.
 *  - Desktop build (invoke rejects): shows error.
 *
 * `@tauri-apps/api/core` is mocked at the module level so tests run in
 * jsdom without needing the actual Tauri JS API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DesktopBadge from "@/components/desktop/DesktopBadge";

// Module-level mock for the dynamic-imported Tauri core API.
// `vi.hoisted` ensures this is set up before any imports run.
const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

function injectTauri() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    invoke: () => undefined,
  };
}

function clearTauri() {
  if ("__TAURI_INTERNALS__" in window) {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  }
}

describe("DesktopBadge", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    clearTauri();
  });

  afterEach(clearTauri);

  it("renders nothing in the web build", () => {
    const { container } = render(<DesktopBadge />);
    expect(container).toBeEmptyDOMElement();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("shows version + build profile when running under Tauri", async () => {
    injectTauri();
    mockInvoke.mockResolvedValue({
      version: "0.0.1",
      build: "debug",
      pr: 7,
    });

    render(<DesktopBadge />);

    await waitFor(() => {
      expect(screen.getByText(/v0\.0\.1/)).toBeInTheDocument();
    });
    expect(screen.getByText(/debug/)).toBeInTheDocument();
    expect(screen.getByText(/PR 7/)).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("get_app_version", undefined);
  });

  it("shows an error message when the Tauri command rejects", async () => {
    injectTauri();
    mockInvoke.mockRejectedValue(new Error("IPC bridge crashed"));

    render(<DesktopBadge />);

    await waitFor(() => {
      expect(screen.getByText(/IPC error: IPC bridge crashed/)).toBeInTheDocument();
    });
  });
});
