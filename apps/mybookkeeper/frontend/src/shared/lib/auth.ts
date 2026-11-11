import posthog from "posthog-js";
import {
  notifyAuthChange,
  onIdentityChange,
  readJwtPayload,
  tokenIdentity,
  useIsAuthenticated,
} from "@platform/ui";
import api from "./api";
import { ACTIVE_ORG_STORAGE_KEY, TOKEN_STORAGE_KEY } from "./session-storage-keys";
import { store } from "@/shared/store";
import { baseApi } from "@/shared/store/baseApi";
import { forgetOrganizations } from "@/shared/store/organizationSlice";
import type { LoginResponse } from "@/shared/types/security/login-response";

export { useIsAuthenticated, notifyAuthChange };

function isPosthogReady(): boolean {
  return Boolean((posthog as unknown as { __loaded?: boolean }).__loaded);
}

function identifyInPosthog(token: string, email: string): void {
  if (!isPosthogReady()) return;
  const userId = readJwtPayload(token)?.sub;
  if (typeof userId === "string" && userId) {
    posthog.identify(userId, { email });
  }
}

function storedUser(): string | null {
  return tokenIdentity(localStorage.getItem(TOKEN_STORAGE_KEY));
}

// The last user this tab saw signed in. A 401 sign-out leaves it, so signing back
// in as that user keeps the organization they picked.
let lastSignedInUser = storedUser();

// Whenever the token changes hands (a sign-in or sign-out here, a 401, or another
// tab), drop the previous user's cached responses and organizations before anything
// re-renders. Without it, RTK Query serves the previous user's data until a hard
// reload. The stored organization choice is shared with every tab, so this leaves
// it alone: only login() and logout(), in the tab running them, change it.
const stopResettingSession = onIdentityChange(() => {
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(forgetOrganizations());
  lastSignedInUser = storedUser() ?? lastSignedInUser;
});
// Hot reload runs this module again; without this the old reset would stay registered.
import.meta.hot?.dispose(stopResettingSession);

export async function login(
  email: string,
  password: string,
  totpCode?: string,
): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/auth/totp/login", {
    email,
    password,
    totp_code: totpCode || null,
  });

  if (data.access_token) {
    // One user's organization choice must not carry over to another.
    if (tokenIdentity(data.access_token) !== lastSignedInUser) {
      localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
    }
    localStorage.setItem(TOKEN_STORAGE_KEY, data.access_token);
    identifyInPosthog(data.access_token, email);
    notifyAuthChange();
  }

  return data;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
  if (isPosthogReady()) {
    posthog.reset();
  }
  notifyAuthChange();
  window.location.href = "/login";
}
