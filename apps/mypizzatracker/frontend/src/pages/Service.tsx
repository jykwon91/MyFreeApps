import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ServiceDashboard } from "@/features/service/ServiceDashboard";

/**
 * Service dashboard route entry. The active drop id lives in the URL as
 * ``?drop_id=...`` so a mid-service refresh preserves the operator's
 * selection.
 */
export default function ServicePage() {
  const [params, setParams] = useSearchParams();
  const dropId = params.get("drop_id");

  const onDropChange = useCallback(
    (newDropId: string) => {
      const next = new URLSearchParams(params);
      next.set("drop_id", newDropId);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  return <ServiceDashboard dropId={dropId} onDropChange={onDropChange} />;
}
