// @platform/core — platform-neutral API client and auth, shared by web and mobile.
//
// No DOM or React Native APIs here: the host passes them in via configurePlatform().

export { configurePlatform, getPlatform } from "./platform/configurePlatform";
export type { OrgStore } from "./platform/types/OrgStore";
export type { PlatformConfig } from "./platform/types/PlatformConfig";
export type { TokenStore } from "./platform/types/TokenStore";

export { default as api } from "./lib/api";
export { notifyAuthChange, useIsAuthenticated } from "./lib/auth-store";
export { baseApi } from "./store/baseApi";
export { axiosBaseQuery } from "./store/baseQuery";
export type { Args } from "./types/api-args";
export type { ApiError } from "./types/api-error";

export { createAuthClient } from "./auth/createAuthClient";
export type { AuthClientStore } from "./auth/types/AuthClientStore";
export type { LoginResult } from "./types/security/login-result";
export type { TotpSetup } from "./types/security/totp-setup";
export type { TotpStatus } from "./types/security/totp-status";
export type { TotpVerifyResponse } from "./types/security/totp-verify-response";
export type { CurrentUser } from "./types/user/current-user";
export type { DeleteAccountRequest } from "./types/user/delete-account-request";
export type { UpdateUserRequest } from "./types/user/update-user-request";

// Subpath-only: store/totpApi, store/userApi, store/accountApi. Loading one injects
// its endpoints into baseApi, so re-exporting them here would inject them into every
// consumer of this index, whether it uses them or not.

export { installStepUpInterceptor } from "./auth/stepUpInterceptor";
export { StepUpCancelledError } from "./auth/errors/StepUpCancelledError";
export { StepUpReauthRequiredError } from "./auth/errors/StepUpReauthRequiredError";
export type { StepUpControllerState } from "./auth/types/StepUpControllerState";
export type { StepUpKind } from "./auth/types/StepUpKind";
