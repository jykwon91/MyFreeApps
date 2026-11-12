import posthog from "posthog-js";
import {
  notifyAuthChange,
  onAccountLeft,
  onIdentityChange,
  readJwtPayload,
  useIsAuthenticated,
} from "@platform/ui";
import api from "./api";
import {
  adoptUnownedOrgId,
  forgetActiveOrgId,
  forgetOtherUsersOrgId,
  hasOtherUsersOrgId,
} from "./activeOrganizationStorage";
import { TOKEN_STORAGE_KEY } from "./session-storage-keys";
import { store } from "@/shared/store";
import { baseApi } from "@/shared/store/baseApi";
import { forgetOrganizations } from "@/shared/store/organizationSlice";
import type { LoginResponse } from "@/shared/types/security/login-response";

export { useIsAuthenticated, notifyAuthChange };

function isPosthogReady(): boolean {
  return Boolean((posthog as unknown as { __loaded?: boolean }).__loaded);
}

// PostHog's identity is shared by every tab, so it is only touched by what this tab
// does itself: a sign-in here or a sign-out here, never by another tab's.
function identifyInPosthog(token: string, email: string): void {
  if (!isPosthogReady()) return;
  const userId = readJwtPayload(token)?.sub;
  if (typeof userId !== "string" || !userId) return;
  // identify() keeps whoever was identified before; start fresh for a different user.
  if (posthog.get_property("$user_state") === "identified" && posthog.get_distinct_id() !== userId) {
    posthog.reset();
  }
  posthog.identify(userId, { email });
}

// A choice stored by a different user than the one signed in at load (a 401, then
// someone else signing in elsewhere) is not this user's.
adoptUnownedOrgId();
forgetOtherUsersOrgId();
// The slice read the stored choice when it was created, before the line above ran.
store.dispatch(forgetOrganizations());

// Whenever the token changes hands (a sign-in or sign-out here, a 401, or another
// tab), drop the previous user's cached responses and organizations before anything
// re-renders. Without it, RTK Query serves the previous user's data until a hard
// reload. A stored organization choice made by someone else goes too; this also
// catches a different user signing in after a reload, when no account-left signal
// can fire. A 401 alone leaves the choice, so the same person signing back in keeps it.
const stopResettingSession = onIdentityChange(() => {
  forgetOtherUsersOrgId();
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(forgetOrganizations());
});

// The stored organization goes when its account signs out or gives way to another,
// unless another tab already stored one for the user now signed in.
const stopLeavingAccount = onAccountLeft(() => {
  if (hasOtherUsersOrgId()) {
    forgetActiveOrgId();
  }
});

// Hot reload runs this module again; without this the old listeners would stay registered.
import.meta.hot?.dispose(() => {
  stopResettingSession();
  stopLeavingAccount();
});

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
    localStorage.setItem(TOKEN_STORAGE_KEY, data.access_token);
    identifyInPosthog(data.access_token, email);
    notifyAuthChange();
  }

  return data;
}

/** Sign out on purpose: clear the token and tell subscribers; PostHog is reset and the account's organization forgotten. */
export function signOut(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  if (isPosthogReady()) {
    posthog.reset();
  }
  notifyAuthChange({ signedOut: true });
}

export function logout(): void {
  signOut();
  window.location.href = "/login";
}
