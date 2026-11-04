import { useUpdateSignedLeaseMutation } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { SignedLeaseStatus } from "@mybookkeeper/api-client/types/lease/signed-lease-status";
import { LoadingButton, OptionSheet, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { LEASE_MESSAGES, markAs, markedAs } from "../../constants/leases";
import { leaseStatusIsFinal, leaseStatusLabel, leaseStatusMoves } from "./leaseDisplay";
import { leaseStatusFailure } from "./leaseStatusFailure";

export default function LeaseStatusControl({ leaseId, status }: { leaseId: string; status: SignedLeaseStatus }) {
  const { showToast } = useToast();
  const [updateLease, { isLoading }] = useUpdateSignedLeaseMutation();
  const [isOpen, setIsOpen] = useState(false);
  // iOS drops an Alert raised while a sheet is still closing, so the choice waits for it to go.
  const chosen = useRef<SignedLeaseStatus | null>(null);
  const moves = leaseStatusMoves(status);

  if (moves.length === 0) return null;

  async function move(next: SignedLeaseStatus) {
    try {
      await updateLease({ leaseId, data: { status: next } }).unwrap();
      showToast(markedAs(leaseStatusLabel(next)));
    } catch (error) {
      showToast(leaseStatusFailure(error), "error");
    }
  }

  function actOnChoice() {
    const next = chosen.current;
    chosen.current = null;
    if (!next) return;
    if (!leaseStatusIsFinal(next)) {
      void move(next);
      return;
    }
    const action = markAs(leaseStatusLabel(next));
    Alert.alert(`${action}?`, LEASE_MESSAGES.finalStatusBody, [
      { text: LEASE_MESSAGES.notNow, style: "cancel" },
      { text: action, style: "destructive", onPress: () => void move(next) },
    ]);
  }

  return (
    <>
      <LoadingButton isLoading={isLoading} loadingText={LEASE_MESSAGES.changingStatus} onPress={() => setIsOpen(true)} variant="secondary">
        {LEASE_MESSAGES.changeStatus}
      </LoadingButton>
      <OptionSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onClosed={actOnChoice}
        onSelect={(next) => {
          // The rows stay live while the sheet slides away, and a second tap isn't a change of mind.
          if (chosen.current) return;
          chosen.current = next;
          setIsOpen(false);
        }}
        options={moves.map((next) => ({ value: next, label: leaseStatusLabel(next) }))}
        title={LEASE_MESSAGES.statusSheetTitle}
        value={null}
      />
    </>
  );
}
