import { DISPLAY_NAME_MAX_LENGTH } from "@platform/core/constants/displayName";
import { useGetCurrentUserQuery, useUpdateCurrentUserMutation } from "@platform/core/store/userApi";
import type { DisplayNameSource } from "../types/DisplayNameSource";

/** The display name on the shared `display_name` field of `/users/me`. */
export function useAccountDisplayName(): DisplayNameSource {
  const user = useGetCurrentUserQuery();
  const [updateCurrentUser] = useUpdateCurrentUserMutation();
  return {
    account: user.data ? { accountId: user.data.id, name: user.data.display_name } : undefined,
    hasFailed: user.isError,
    reload: () => user.refetch().unwrap(),
    save: (name) => updateCurrentUser({ display_name: name }).unwrap(),
    maxLength: DISPLAY_NAME_MAX_LENGTH,
  };
}
