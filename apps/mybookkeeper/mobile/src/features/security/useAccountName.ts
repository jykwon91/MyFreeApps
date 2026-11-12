import { USER_NAME_INPUT_MAX_LENGTH } from "@mybookkeeper/api-client/constants/userName";
import { useGetAccountNameQuery, useUpdateAccountNameMutation } from "@mybookkeeper/api-client/store/accountNameApi";
import type { DisplayNameSource } from "@platform/mobile";

/** The name tenants see on rent receipts and emails, which MyBookkeeper keeps in `name`. */
export function useAccountName(): DisplayNameSource {
  const account = useGetAccountNameQuery();
  const [updateAccountName] = useUpdateAccountNameMutation();
  return {
    account: account.data ? { accountId: account.data.id, name: account.data.name ?? "" } : undefined,
    hasFailed: account.isError,
    reload: () => account.refetch().unwrap(),
    save: (name) => updateAccountName({ name }).unwrap(),
    maxLength: USER_NAME_INPUT_MAX_LENGTH,
  };
}
