/**
 * Unit tests for TurnstileWidget — render options (`action`, `appearance`),
 * the imperative `reset()` handle, and widget cleanup on unmount.
 */
import { createRef } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnstileWidgetHandle } from "../types/turnstile-widget-handle";

vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");

describe("TurnstileWidget", () => {
  const renderMock = vi.fn(() => "widget-1");

  beforeEach(() => {
    renderMock.mockClear();
    window.turnstile = { render: renderMock, reset: vi.fn(), remove: vi.fn() };
  });

  afterEach(() => {
    delete window.turnstile;
  });

  it("passes action to turnstile.render when provided", async () => {
    const { default: TurnstileWidget } = await import("../components/ui/TurnstileWidget");
    render(<TurnstileWidget onVerify={vi.fn()} action="feature_request" />);
    expect(renderMock).toHaveBeenCalledTimes(1);
    const options = (renderMock.mock.calls[0] as unknown as [HTMLElement, Record<string, unknown>])[1];
    expect(options.action).toBe("feature_request");
  });

  it("omits action when not provided", async () => {
    const { default: TurnstileWidget } = await import("../components/ui/TurnstileWidget");
    render(<TurnstileWidget onVerify={vi.fn()} />);
    const options = (renderMock.mock.calls[0] as unknown as [HTMLElement, Record<string, unknown>])[1];
    expect("action" in options).toBe(false);
  });

  it("passes appearance to turnstile.render when provided", async () => {
    const { default: TurnstileWidget } = await import("../components/ui/TurnstileWidget");
    render(<TurnstileWidget onVerify={vi.fn()} appearance="interaction-only" />);
    const options = (renderMock.mock.calls[0] as unknown as [HTMLElement, Record<string, unknown>])[1];
    expect(options.appearance).toBe("interaction-only");
  });

  it("omits appearance when not provided, keeping Cloudflare's default", async () => {
    const { default: TurnstileWidget } = await import("../components/ui/TurnstileWidget");
    render(<TurnstileWidget onVerify={vi.fn()} />);
    const options = (renderMock.mock.calls[0] as unknown as [HTMLElement, Record<string, unknown>])[1];
    expect("appearance" in options).toBe(false);
  });
});

describe("TurnstileWidget reset + lifecycle", () => {
  const renderMock = vi.fn(() => "widget-1");
  const resetMock = vi.fn();
  const removeMock = vi.fn();

  beforeEach(() => {
    renderMock.mockClear();
    resetMock.mockClear();
    removeMock.mockClear();
    window.turnstile = { render: renderMock, reset: resetMock, remove: removeMock };
  });

  afterEach(() => {
    delete window.turnstile;
  });

  it("exposes reset() through ref, calling turnstile.reset with the widget id", async () => {
    const { default: TurnstileWidget } = await import("../components/ui/TurnstileWidget");
    const ref = createRef<TurnstileWidgetHandle>();
    render(<TurnstileWidget ref={ref} onVerify={vi.fn()} />);
    ref.current?.reset();
    expect(resetMock).toHaveBeenCalledWith("widget-1");
  });

  it("removes the widget on unmount when the script was already loaded", async () => {
    const { default: TurnstileWidget } = await import("../components/ui/TurnstileWidget");
    const { unmount } = render(<TurnstileWidget onVerify={vi.fn()} />);
    unmount();
    expect(removeMock).toHaveBeenCalledWith("widget-1");
  });

  it("routes callbacks to the latest props without re-rendering the widget", async () => {
    const { default: TurnstileWidget } = await import("../components/ui/TurnstileWidget");
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<TurnstileWidget onVerify={first} />);
    rerender(<TurnstileWidget onVerify={second} />);
    expect(renderMock).toHaveBeenCalledTimes(1);
    const options = (renderMock.mock.calls[0] as unknown as [HTMLElement, Record<string, unknown>])[1];
    (options.callback as (token: string) => void)("tok-1");
    expect(second).toHaveBeenCalledWith("tok-1");
    expect(first).not.toHaveBeenCalled();
  });
});
