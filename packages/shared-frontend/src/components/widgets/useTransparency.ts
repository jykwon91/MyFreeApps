import { useEffect, useState } from "react";
import type { TransparencyState } from "../../types/transparency-state";

/**
 * Platform-wide cost-transparency figures for the current month.
 * Served by the shared, public `GET /transparency` endpoint (platform_shared, PR2).
 * Amounts are in cents to avoid float rounding — divide by 100 for display.
 */
export interface TransparencyData {
  /** Display label for the period, e.g. "June 2026". */
  month: string;
  /** Total platform server costs for the month, in cents. */
  costs_cents: number;
  /** Donations received for the month, in cents (net of processor fees). */
  donations_cents: number;
  /** ISO timestamp of the last automated sync, or null if never synced. */
  updated_at: string | null;
  /** False until the operator has configured monthly costs — the widget hides itself. */
  configured: boolean;
}

export type TransparencyResult =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; data: TransparencyData };

/**
 * Fetches the public cost-transparency figures with a plain unauthenticated
 * request rather than the shared RTK `baseApi`. This keeps the widget truly
 * drop-in: it behaves identically whether the host app registers the shared
 * baseApi (MGA/MJH/MPT) or its own (MBK), and it never sends a session token
 * to a public endpoint.
 */
export function useTransparency(baseUrl = "/api"): TransparencyResult {
  const [state, setState] = useState<TransparencyState>({ baseUrl, result: { status: "loading" } });

  // Adjusting state during render rather than in an effect: a changed `baseUrl` starts over from loading,
  // so a result for an earlier URL (including one from a URL we've since returned to) is never shown.
  if (state.baseUrl !== baseUrl) setState({ baseUrl, result: { status: "loading" } });

  useEffect(() => {
    const controller = new AbortController();
    const settle = (result: TransparencyResult): void => setState({ baseUrl, result });

    fetch(`${baseUrl}/transparency`, { credentials: "omit", signal: controller.signal })
      .then((res) =>
        res.ok ? (res.json() as Promise<TransparencyData>) : Promise.reject(new Error(`HTTP ${res.status}`)),
      )
      .then((data) => settle({ status: "ok", data }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        settle({ status: "error" });
      });

    return () => controller.abort();
  }, [baseUrl]);

  return state.baseUrl === baseUrl ? state.result : { status: "loading" };
}
