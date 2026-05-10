/**
 * Axios response interceptor that drives the step-up auth flow.
 *
 * Installation:
 *
 *   import api from "@platform/ui/lib/api";
 *   import { installStepUpInterceptor } from "@platform/ui/auth/stepUpInterceptor";
 *
 *   installStepUpInterceptor(api);
 *
 * Required prerequisite: the host axios instance's pre-existing 401
 * handler MUST skip responses that carry an ``X-Require-Step-Up``
 * header. Otherwise the existing handler will clear the JWT before
 * this interceptor gets a chance to re-fire the original request.
 * See ``packages/shared-frontend/src/lib/api.ts`` for the canonical
 * shape; MBK's forked ``apps/mybookkeeper/frontend/src/shared/lib/
 * api.ts`` mirrors it.
 *
 * Behavior on 401 with ``X-Require-Step-Up: totp``:
 *   1. Ask the user for a fresh TOTP code via the controller.
 *   2. Replay the original request with ``X-TOTP-Code: <code>``.
 *   3. On wrong-code (another 401+totp), re-prompt with an inline
 *      error message; loop until the user succeeds or cancels.
 *   4. On cancel, reject the original request with
 *      ``StepUpCancelledError``.
 *   5. On any other retry failure, propagate it to the caller.
 *
 * Behavior on 401 with ``X-Require-Step-Up: reauth``:
 *   1. Clear the JWT token and notify the auth-change listeners
 *      (existing logout pattern).
 *   2. Reject the original request with
 *      ``StepUpReauthRequiredError``.
 *   3. The host app's existing routing redirects to ``/login``.
 */
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

import { notifyAuthChange } from "@/shared/lib/auth-store";
import { StepUpReauthRequiredError } from "@/shared/auth/errors/StepUpReauthRequiredError";
import {
  cancel as controllerCancel,
  request as controllerRequest,
  signalReauth as controllerSignalReauth,
  signalSuccess as controllerSignalSuccess,
  signalWrongCode as controllerSignalWrongCode,
} from "@/shared/auth/stepUpController";

interface StepUpRetryConfig extends AxiosRequestConfig {
  _stepUpRetried?: boolean;
}

const WRONG_CODE_MESSAGE =
  "That code didn't match. Check your authenticator app and try again.";

function _stepUpHeader(headers: unknown): "totp" | "reauth" | null {
  if (!headers || typeof headers !== "object") return null;
  // axios normalizes response headers to lowercase keys
  const value =
    (headers as Record<string, unknown>)["x-require-step-up"] ??
    (headers as Record<string, unknown>)["X-Require-Step-Up"];
  if (value === "totp" || value === "reauth") return value;
  return null;
}

interface AxiosLikeError {
  config?: StepUpRetryConfig;
  response?: { status?: number; headers?: unknown };
}

function _isAxiosError(e: unknown): e is AxiosLikeError {
  return (
    typeof e === "object" &&
    e !== null &&
    ("response" in e || "config" in e)
  );
}

function _attachTotpHeader(
  config: StepUpRetryConfig,
  code: string,
): StepUpRetryConfig {
  return {
    ...config,
    _stepUpRetried: true,
    headers: { ...(config.headers ?? {}), "X-TOTP-Code": code },
  };
}

function _handleReauth(): never {
  controllerSignalReauth();
  if (typeof window !== "undefined") {
    localStorage.removeItem("token");
    notifyAuthChange();
  }
  throw new StepUpReauthRequiredError();
}

export function installStepUpInterceptor(api: AxiosInstance): () => void {
  const interceptorId = api.interceptors.response.use(
    (res: AxiosResponse) => res,
    async (err: unknown) => {
      if (!_isAxiosError(err)) return Promise.reject(err);
      const status = err.response?.status;
      if (status !== 401) return Promise.reject(err);

      const kind = _stepUpHeader(err.response?.headers);
      if (!kind) return Promise.reject(err);

      if (err.config?._stepUpRetried) {
        return Promise.reject(err);
      }

      if (kind === "reauth") {
        try {
          _handleReauth();
        } catch (reauthErr) {
          return Promise.reject(reauthErr);
        }
      }

      const originalConfig = err.config ?? {};
      let code: string;
      try {
        code = await controllerRequest("totp");
      } catch (cancelErr) {
        return Promise.reject(cancelErr);
      }

      while (true) {
        const retryConfig = _attachTotpHeader(originalConfig, code);
        try {
          const retryResp = await api.request(retryConfig);
          controllerSignalSuccess();
          return retryResp;
        } catch (retryErr) {
          if (!_isAxiosError(retryErr)) {
            controllerSignalSuccess();
            return Promise.reject(retryErr);
          }
          const retryStatus = retryErr.response?.status;
          const retryKind = _stepUpHeader(retryErr.response?.headers);
          if (retryStatus === 401 && retryKind === "totp") {
            controllerSignalWrongCode(WRONG_CODE_MESSAGE);
            try {
              code = await controllerRequest("totp");
              continue;
            } catch (cancelErr) {
              return Promise.reject(cancelErr);
            }
          }
          if (retryStatus === 401 && retryKind === "reauth") {
            try {
              _handleReauth();
            } catch (reauthErr) {
              return Promise.reject(reauthErr);
            }
          }
          if (retryStatus === 403) {
            controllerCancel("user_cancelled");
            return Promise.reject(retryErr);
          }
          controllerSignalSuccess();
          return Promise.reject(retryErr);
        }
      }
    },
  );

  return () => {
    api.interceptors.response.eject(interceptorId);
  };
}
