import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { OrgWithRole } from "@/shared/types/organization/org-with-role";
import { ACTIVE_ORG_STORAGE_KEY } from "@/shared/lib/session-storage-keys";
import { baseApi } from "./baseApi";

interface OrganizationState {
  activeOrgId: string | null;
  organizations: OrgWithRole[];
}

function loadActiveOrgId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

const initialState: OrganizationState = {
  activeOrgId: loadActiveOrgId(),
  organizations: [],
};

const organizationSlice = createSlice({
  name: "organization",
  initialState,
  reducers: {
    setActiveOrg(state, action: PayloadAction<string | null>) {
      state.activeOrgId = action.payload;
      try {
        if (action.payload) {
          localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, action.payload);
        } else {
          localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
        }
      } catch {
        // storage unavailable
      }
    },
    setOrganizations(state, action: PayloadAction<OrgWithRole[]>) {
      state.organizations = action.payload;
      if (state.activeOrgId && !action.payload.some((o) => o.id === state.activeOrgId)) {
        state.activeOrgId = action.payload[0]?.id ?? null;
        try {
          if (state.activeOrgId) {
            localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, state.activeOrgId);
          } else {
            localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
          }
        } catch {
          // storage unavailable
        }
      }
      if (!state.activeOrgId && action.payload.length > 0) {
        state.activeOrgId = action.payload[0].id;
        try {
          localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, state.activeOrgId);
        } catch {
          // storage unavailable
        }
      }
    },
    // The previous user's organizations go when the session changes hands. The stored
    // choice is shared with the other tabs, so it is re-read rather than removed: only
    // the tab that signs in or out changes it.
    forgetOrganizations(state) {
      state.organizations = [];
      state.activeOrgId = loadActiveOrgId();
    },
  },
});

export const { setActiveOrg, setOrganizations, forgetOrganizations } = organizationSlice.actions;

export function switchOrg(orgId: string) {
  return (dispatch: (action: unknown) => void) => {
    dispatch(setActiveOrg(orgId));
    dispatch(baseApi.util.resetApiState());
  };
}

export default organizationSlice.reducer;
