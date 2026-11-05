import { router, useNavigation } from "expo-router";
import { NEW_LEASE_SCREEN_PREFIX } from "../../constants/newLease";

/** Back from the new lease goes to where the flow began. Its pickers would only make a second one. */
export function useLeaveNewLeaseFlow(): (leaseId: string) => void {
  const navigation = useNavigation();
  return (leaseId) => {
    const flowScreens = navigation.getState()?.routes.filter((route) => route.name.startsWith(NEW_LEASE_SCREEN_PREFIX)).length ?? 1;
    if (flowScreens > 1) router.dismiss(flowScreens - 1);
    router.replace(`/leases/${leaseId}`);
  };
}
