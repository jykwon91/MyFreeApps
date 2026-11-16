import { useEffect, useImperativeHandle, useRef } from "react";
import type { Ref } from "react";
import { turnstileSiteKey } from "../../lib/turnstile-site-key";
import type { TurnstileAppearance } from "../../types/turnstile-appearance";
import type { TurnstileWidgetHandle } from "../../types/turnstile-widget-handle";

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  /** Cloudflare widget action; echoed in siteverify so the backend can bind the token to this widget. */
  action?: string;
  /** Cloudflare widget appearance. "interaction-only" stays hidden unless the visitor must click. Omitted = Cloudflare's default (always shown). */
  appearance?: TurnstileAppearance;
  /** Exposes `reset()` for a fresh single-use token. `useTurnstileToken` wires this for you. */
  ref?: Ref<TurnstileWidgetHandle>;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export default function TurnstileWidget({ onVerify, onExpire, action, appearance, ref }: TurnstileWidgetProps) {
  const siteKey = turnstileSiteKey();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Cloudflare keeps the callbacks it was rendered with; route through refs so
  // a new callback identity never forces a re-render (and a fresh challenge).
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
  });

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
    },
  }), []);

  useEffect(() => {
    if (!siteKey) return;
    let unmounted = false;

    const renderWidget = () => {
      if (unmounted || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onVerifyRef.current(token),
        "expired-callback": () => onExpireRef.current?.(),
        theme: "auto",
        ...(action ? { action } : {}),
        ...(appearance ? { appearance } : {}),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
    }

    return () => {
      unmounted = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, action, appearance]);

  if (!siteKey) return null;

  return <div ref={containerRef} className="flex justify-center" />;
}
