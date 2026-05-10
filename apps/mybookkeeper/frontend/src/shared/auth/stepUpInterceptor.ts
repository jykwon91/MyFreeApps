/**
 * Axios response interceptor that drives the step-up auth flow.
 *
 * MBK fork — byte-identical to packages/shared-frontend/src/auth/
 * stepUpInterceptor.ts (with the auth-store import re-pointed at
 * MBK's local fork). Will be deleted once MBK migrates to React 19
 * and consumes from @platform/ui.
 *
 * Required prerequisite: the host axios instance's pre-existing 401
 * handler MUST skip responses that carry an ``X-Require-Step-Up``
 * header. Otherwise the existing handler will clear the JWT before
 * this interceptor gets a chance to re-fire the original request.
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
