/**
 * Module-level singleton state for the step-up auth flow.
 *
 * The controller mediates between two sides:
 *
 *   - The HTTP layer (axios response interceptor) — calls
 *     ``request("totp")`` when a 401 with ``X-Require-Step-Up: totp``
 *     arrives, and awaits the returned Promise. On a wrong-code retry
 *     it calls ``signalWrongCode(msg)`` and then awaits the Promise
 *     from a fresh ``request("totp")`` call (which re-uses the
 *     already-open modal — only the very first call opens it).
 *
 *   - The React layer (StepUpModal) — subscribes via ``subscribe`` /
 *     ``getState`` (compatible with ``useSyncExternalStore``). Calls
 *     ``submitCode(code)`` when the user clicks Verify, and
 *     ``cancel("user_cancelled")`` on Cancel/ESC/backdrop.
 *
 * The controller is intentionally React-free so MBK's
 * React-18-pinned fork can install the interceptor without dragging
 * React-19 transitive deps into the bundle. React surface is
 * isolated to ``StepUpModal.tsx``.
 *
 * Concurrency: all in-flight ``request()`` calls share a single
 * pending-resolvers queue. ``submitCode`` resolves the entire queue
 * with the same code. This is what lets three concurrent admin
 * requests share one modal and retry with one X-TOTP-Code value.
 */
import { StepUpCancelledError } from "@/shared/auth/errors/StepUpCancelledError";
import type { StepUpControllerState } from "@/shared/auth/types/StepUpControllerState";

interface PendingResolver {
  resolve: (code: string) => void;
  reject: (error: Error) => void;
}

let _state: StepUpControllerState = {
  pending: null,
  attempt: 0,
  errorMessage: null,
  submitting: false,
};

let _resolvers: PendingResolver[] = [];

const _listeners = new Set<() => void>();

function _emit(): void {
  _listeners.forEach((l) => l());
}

function _set(next: Partial<StepUpControllerState>): void {
  _state = { ..._state, ...next };
  _emit();
}

export function subscribe(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

export function getState(): StepUpControllerState {
  return _state;
}

/**
 * Request a step-up code from the user. Resolves with the typed
 * code, or rejects with ``StepUpCancelledError`` if the user
 * dismisses the modal.
 *
 * The first call (when no modal is open) opens the modal in a clean
 * state. Subsequent calls — whether from concurrent in-flight
 * requests or from the same request after a wrong-code signal —
 * just enqueue a new resolver without disturbing the existing modal
 * state. This is what preserves the wrong-code error message across
 * the loop iteration in ``stepUpInterceptor``.
 */
export function request(kind: "totp"): Promise<string> {
  void kind;
  return new Promise<string>((resolve, reject) => {
    _resolvers.push({ resolve, reject });
    if (_state.pending == null) {
      _set({
        pending: { kind: "totp" },
        submitting: false,
        errorMessage: null,
      });
    }
  });
}

/**
 * Called by the modal when the user submits a code. Resolves every
 * pending resolver with the same code (concurrent admin requests
 * each retry with the same X-TOTP-Code).
 */
export function submitCode(code: string): void {
  if (_resolvers.length === 0) return;
  const all = _resolvers;
  _resolvers = [];
  _set({ submitting: true, errorMessage: null });
  all.forEach((p) => p.resolve(code));
}

/**
 * Called by the interceptor when the retry returned 401 +
 * ``X-Require-Step-Up: totp`` again — the typed code was wrong.
 * Updates the modal to show the supplied error and returns to the
 * "awaiting code" state. The interceptor's next ``request("totp")``
 * call will enqueue a resolver for the user's next attempt.
 */
export function signalWrongCode(message: string): void {
  _set({
    pending: { kind: "totp" },
    submitting: false,
    errorMessage: message,
    attempt: _state.attempt + 1,
  });
}

/**
 * Called by the interceptor when the retry succeeded. Closes the
 * modal and resets controller state.
 */
export function signalSuccess(): void {
  _resolvers = [];
  _set({
    pending: null,
    submitting: false,
    errorMessage: null,
    attempt: 0,
  });
}

/**
 * Called by the interceptor when the retry returned
 * ``X-Require-Step-Up: reauth`` — the JWT iat is past the recent-auth
 * window. Closes the modal and rejects any queued resolvers; the
 * interceptor itself handles the redirect-to-login.
 */
export function signalReauth(): void {
  const all = _resolvers;
  _resolvers = [];
  _set({
    pending: null,
    submitting: false,
    errorMessage: null,
    attempt: 0,
  });
  const err = new StepUpCancelledError("user_cancelled");
  all.forEach((p) => p.reject(err));
}

/**
 * Called by the modal on Cancel/ESC/backdrop, or by the unload
 * handler when the tab closes. Rejects every pending resolver with
 * ``StepUpCancelledError``.
 */
export function cancel(
  reason: "user_cancelled" | "tab_closed" = "user_cancelled",
): void {
  const all = _resolvers;
  _resolvers = [];
  _set({
    pending: null,
    submitting: false,
    errorMessage: null,
    attempt: 0,
  });
  const err = new StepUpCancelledError(reason);
  all.forEach((p) => p.reject(err));
}

/** Test-only: reset all module state. Not exported from index.ts. */
export function _resetForTests(): void {
  _resolvers = [];
  _state = {
    pending: null,
    attempt: 0,
    errorMessage: null,
    submitting: false,
  };
  _listeners.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (_resolvers.length > 0) {
      cancel("tab_closed");
    }
  });
}
