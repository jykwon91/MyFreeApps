import { signedLeasesApi, useDeleteSignedLeaseMutation, useGetSignedLeaseByIdQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { LoadingButton, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { deleteLeaseLabel, deleteLeaseTitle, LEASE_MESSAGES } from "../../constants/leases";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import type { AppDispatch } from "../../lib/store";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { askOnce } from "./askOnce";

interface DeleteLeaseButtonProps {
  leaseId: string;
  tenantName: string | null;
  parentLeaseId: string | null;
  successorLeaseId: string | null;
}

export default function DeleteLeaseButton({ leaseId, tenantName, parentLeaseId, successorLeaseId }: DeleteLeaseButtonProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();
  const [deleteLease] = useDeleteSignedLeaseMutation();
  const { refetch } = useGetSignedLeaseByIdQuery(leaseId);
  const [isBusy, setIsBusy] = useState(false);
  const asking = useRef(false);

  function finish(): void {
    // A neighbour still on screen would keep a link to this lease.
    const neighbours = [parentLeaseId, successorLeaseId].filter((id) => id !== null);
    dispatch(signedLeasesApi.util.invalidateTags(neighbours.map((id) => ({ type: "SignedLease" as const, id }))));
    if (router.canGoBack()) router.back();
    else router.replace("/leases");
    showToast(LEASE_MESSAGES.deleted);
  }

  /** The server commits before it answers, so a failed answer doesn't mean nothing happened. */
  async function checkWhatHappened(): Promise<void> {
    const latest = await refetch();
    if (httpStatus(latest.error) === 404) finish();
    else if (latest.isSuccess) showToast(LEASE_MESSAGES.deleteFailed, "error");
    else showToast(LEASE_MESSAGES.deleteUnsure, "error");
  }

  async function confirmed(): Promise<void> {
    setIsBusy(true);
    try {
      await deleteLease(leaseId).unwrap();
      finish();
    } catch (error) {
      const status = httpStatus(error);
      if (status === 404) finish();
      else if (status === 403) showToast(UPLOAD_MESSAGES.notAllowed, "error");
      else await checkWhatHappened();
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <LoadingButton
      accessibilityHint={LEASE_MESSAGES.deleteLeaseHint}
      accessibilityLabel={deleteLeaseLabel(tenantName)}
      isLoading={isBusy}
      loadingText={LEASE_MESSAGES.deleting}
      onPress={() => askOnce(asking, deleteLeaseTitle(tenantName), LEASE_MESSAGES.deleteLeaseBody, { text: LEASE_MESSAGES.deleteLease, style: "destructive", onPress: () => void confirmed() })}
      variant="destructive"
    >
      {LEASE_MESSAGES.deleteLease}
    </LoadingButton>
  );
}
