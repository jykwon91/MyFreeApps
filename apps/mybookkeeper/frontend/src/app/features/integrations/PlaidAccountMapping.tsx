import { useCallback } from "react";
import {
  useGetPlaidAccountsQuery,
  useUpdateAccountPropertyMutation,
} from "@/shared/store/plaidApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import Select from "@/shared/components/ui/Select";
import Skeleton from "@/shared/components/ui/Skeleton";

export interface PlaidAccountMappingProps {
  itemId: string;
  onError: (message: string) => void;
}

export default function PlaidAccountMapping({ itemId, onError }: PlaidAccountMappingProps) {
  const { data: accounts = [], isLoading: accountsLoading } = useGetPlaidAccountsQuery(itemId);
  const { data: properties = [] } = useGetPropertiesQuery();
  const [updateProperty] = useUpdateAccountPropertyMutation();

  const handlePropertyChange = useCallback(
    (accountId: string, value: string) => {
      const propertyId = value === "" ? null : value;
      updateProperty({ accountId, property_id: propertyId })
        .unwrap()
        .catch((err) => onError(`Couldn't update the property mapping: ${extractErrorMessage(err)}`));
    },
    [updateProperty, onError],
  );

  if (accountsLoading) {
    return (
      <div className="space-y-2 py-2">
        <Skeleton className="h-8 w-full rounded" />
        <Skeleton className="h-8 w-full rounded" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No accounts found for this connection.
      </p>
    );
  }

  return (
    <table className="w-full text-sm mt-2">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="pb-2 font-medium">Account</th>
          <th className="pb-2 font-medium">Type</th>
          <th className="pb-2 font-medium">Last 4</th>
          <th className="pb-2 font-medium">Property</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {accounts.map((account) => (
          <tr key={account.id} className={account.is_active ? "" : "opacity-50"}>
            <td className="py-2 pr-3">
              <span className="font-medium">{account.name}</span>
              {account.official_name ? (
                <span className="text-muted-foreground ml-1 text-xs">
                  ({account.official_name})
                </span>
              ) : null}
            </td>
            <td className="py-2 pr-3 text-muted-foreground capitalize">
              {account.account_subtype ?? account.account_type}
            </td>
            <td className="py-2 pr-3 text-muted-foreground font-mono">
              {account.mask ? `...${account.mask}` : "\u2014"}
            </td>
            <td className="py-2">
              <Select
                value={account.property_id ?? ""}
                onChange={(e) => handlePropertyChange(account.id, e.target.value)}
                className="w-full max-w-[200px]"
              >
                <option value="">Unassigned</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
