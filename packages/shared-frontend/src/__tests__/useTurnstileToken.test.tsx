/**
 * useTurnstileToken + TurnstileWidget: a reset drops the spent token (so
 * `isReady` goes false) and asks Cloudflare for a fresh challenge.
 */
import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TurnstileWidget from "../components/ui/TurnstileWidget";
import { useTurnstileToken } from "../hooks/useTurnstileToken";
import type { TurnstileTokenState } from "../types/turnstile-token-state";

type RenderOptions = Record<string, unknown>;

describe("useTurnstileToken with a site key", () => {
  const renderMock = vi.fn((_el: HTMLElement, _options: RenderOptions) => "widget-1");
  const resetMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
    renderMock.mockClear();
    resetMock.mockClear();
    window.turnstile = { render: renderMock, reset: resetMock, remove: vi.fn() };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.turnstile;
  });

  function Harness({ onState }: { onState: (state: TurnstileTokenState) => void }) {
    const turnstile = useTurnstileToken();
    onState(turnstile);
    return <TurnstileWidget {...turnstile.widgetProps} />;
  }

  function mountHarness() {
    let latest: TurnstileTokenState | undefined;
    render(<Harness onState={(s) => { latest = s; }} />);
    const options = renderMock.mock.calls[0][1];
    const verify = (token: string) => act(() => (options.callback as (t: string) => void)(token));
    const expire = () => act(() => (options["expired-callback"] as () => void)());
    return { state: () => latest as TurnstileTokenState, verify, expire };
  }

  it("is not ready until the widget verifies", () => {
    const h = mountHarness();
    expect(h.state().required).toBe(true);
    expect(h.state().isReady).toBe(false);
    h.verify("tok-1");
    expect(h.state().token).toBe("tok-1");
    expect(h.state().isReady).toBe(true);
  });

  it("reset() clears the token and resets the Cloudflare widget", () => {
    const h = mountHarness();
    h.verify("tok-1");
    act(() => h.state().reset());
    expect(h.state().token).toBe("");
    expect(h.state().isReady).toBe(false);
    expect(resetMock).toHaveBeenCalledWith("widget-1");
    h.verify("tok-2");
    expect(h.state().token).toBe("tok-2");
    expect(h.state().isReady).toBe(true);
  });

  it("expiry clears the token", () => {
    const h = mountHarness();
    h.verify("tok-1");
    h.expire();
    expect(h.state().token).toBe("");
    expect(h.state().isReady).toBe(false);
  });
});

describe("useTurnstileToken without a site key (dev / CI)", () => {
  beforeEach(() => vi.stubEnv("VITE_TURNSTILE_SITE_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("is always ready and reset() is a harmless no-op", () => {
    const { result } = renderHook(() => useTurnstileToken());
    expect(result.current.required).toBe(false);
    expect(result.current.isReady).toBe(true);
    act(() => result.current.reset());
    expect(result.current.isReady).toBe(true);
  });
});
