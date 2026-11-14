import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { OrgWithRole } from "@mybookkeeper/api-client/types/organization/OrgWithRole";
import { persistActiveOrgId, readActiveOrgId } from "@/shared/lib/activeOrganizationStorage";
import { baseApi } from "./baseApi";

interface OrganizationState {
  activeOrgId: string | null;
  organizations: OrgWithRole[];
}

const initialState: OrganizationState = {
  activeOrgId: readActiveOrgId(),
  organizations: [],
};

const organizationSlice = createSlice({
  name: "organization",
  initialState,
  reducers: {
    setActiveOrg(state, action: PayloadAction<string | null>) {
      state.activeOrgId = action.payload;
      persistActiveOrgId(action.payload);
    },
    setOrganizations(state, action: PayloadAction<OrgWithRole[]>) {
      state.organizations = action.payload;
      if (state.activeOrgId && !action.payload.some((o) => o.id === state.activeOrgId)) {
        state.activeOrgId = action.payload[0]?.id ?? null;
        persistActiveOrgId(state.activeOrgId);
      }
      if (!state.activeOrgId && action.payload.length > 0) {
        state.activeOrgId = action.payload[0].id;
        persistActiveOrgId(state.activeOrgId);
      }
    },
    // The previous user's organizations go when the session changes hands. The stored
    // choice is shared with the other tabs, so it is re-read rather than removed: only
    // the tab that signs in or out changes it.
    forgetOrganizations(state) {
      state.organizations = [];
      state.activeOrgId = readActiveOrgId();
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
