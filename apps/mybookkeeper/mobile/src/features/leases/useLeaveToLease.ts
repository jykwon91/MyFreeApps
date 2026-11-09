import { router } from "expo-router";
import { useEffect, useState } from "react";

/**
 * Goes back to the lease once `leave` is called, past any screens opened on the way. It waits a
 * render, or the discard question still sees the unsaved changes.
 */
export function useLeaveToLease(leaseId: string) {
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (isLeaving) router.dismissTo(`/leases/${leaseId}`);
  }, [isLeaving, leaseId]);

  return { isLeaving, leave: () => setIsLeaving(true) };
}
