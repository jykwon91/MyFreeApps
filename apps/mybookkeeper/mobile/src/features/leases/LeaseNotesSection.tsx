import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text } from "react-native";
import { LEASE_DETAIL_MESSAGES as MESSAGES } from "../../constants/leaseDetails";
import { LEASE_MESSAGES } from "../../constants/leases";
import InquirySection from "../inquiries/InquirySection";
import { useCanWrite } from "../workspace/useCanWrite";
import LeaseNotesSheet from "./LeaseNotesSheet";

/** The host's own notes. A viewer reads them; a writer can change them. */
export default function LeaseNotesSection({ lease }: { lease: Pick<SignedLeaseDetail, "id" | "notes"> }) {
  const { colors, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const [isEditing, setIsEditing] = useState(false);
  const notes = lease.notes?.trim() ?? "";
  if (!notes && !canWrite) return null;

  return (
    <InquirySection title={LEASE_MESSAGES.notes}>
      <Text style={{ fontSize: fontSize.md, color: notes ? colors.foreground : colors.mutedForeground }}>{notes || MESSAGES.noNotes}</Text>
      {canWrite ? (
        <LoadingButton onPress={() => setIsEditing(true)} variant="secondary">
          {notes ? MESSAGES.editNotes : MESSAGES.addNotes}
        </LoadingButton>
      ) : null}
      {isEditing ? <LeaseNotesSheet leaseId={lease.id} notes={notes} onClose={() => setIsEditing(false)} /> : null}
    </InquirySection>
  );
}
