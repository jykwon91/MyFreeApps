import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { OrgWithRole } from "@/shared/types/organization/org-with-role";
import { baseApi } from "./baseApi";

const STORAGE_KEY = "v1_activeOrgId";

interface OrganizationState {
  activeOrgId: string | null;
  organizations: OrgWithRole[];
}

function loadActiveOrgId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
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
          localStorage.setItem(STORAGE_KEY, action.payload);
        } else {
          localStorage.removeItem(STORAGE_KEY);
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
            localStorage.setItem(STORAGE_KEY, state.activeOrgId);
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        } catch {
          // storage unavailable
        }
      }
      if (!state.activeOrgId && action.payload.length > 0) {
        state.activeOrgId = action.payload[0].id;
        try {
          localStorage.setItem(STORAGE_KEY, state.activeOrgId);
        } catch {
          // storage unavailable
        }
      }
    },
    clearOrganizationState(state) {
      state.activeOrgId = null;
      state.organizations = [];
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // storage unavailable
      }
    },
  },
});

export const { setActiveOrg, setOrganizations, clearOrganizationState } = organizationSlice.actions;

export function switchOrg(orgId: string) {
  return (dispatch: (action: unknown) => void) => {
    dispatch(setActiveOrg(orgId));
    dispatch(baseApi.util.resetApiState());
  };
}

export default organizationSlice.reducer;
