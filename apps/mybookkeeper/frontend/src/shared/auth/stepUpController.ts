/**
 * Module-level singleton state for the step-up auth flow.
 *
 * MBK fork — byte-identical to packages/shared-frontend/src/auth/
 * stepUpController.ts. Will be deleted once MBK migrates to React 19
 * and consumes from @platform/ui (see project memory:
 * project_mbk_platform_ui_migration_blocked).
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

export function submitCode(code: string): void {
  if (_resolvers.length === 0) return;
  const all = _resolvers;
  _resolvers = [];
  _set({ submitting: true, errorMessage: null });
  all.forEach((p) => p.resolve(code));
}

export function signalWrongCode(message: string): void {
  _set({
    pending: { kind: "totp" },
    submitting: false,
    errorMessage: message,
    attempt: _state.attempt + 1,
  });
}

export function signalSuccess(): void {
  _resolvers = [];
  _set({
    pending: null,
    submitting: false,
    errorMessage: null,
    attempt: 0,
  });
}

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
