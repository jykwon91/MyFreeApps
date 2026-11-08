/**
 * Unit tests for TurnstileWidget — the optional `action` prop must reach
 * `turnstile.render` and be omitted entirely when not provided.
 */
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
