import { useEndTenancyMutation, useRestartTenancyMutation } from "@mybookkeeper/api-client/store/applicantsApi";
import { useGetSignedLeasesQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { ApplicantDetailResponse } from "@mybookkeeper/api-client/types/applicant/applicant-detail-response";
import { tenancyState } from "@mybookkeeper/api-client/utils/tenancyState";
import { Chip, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Text } from "react-native";
import { MOST_LEASES_ONE_PERSON_HAS } from "../../constants/leases";
import { endedToast, restartedToast, TENANT_MESSAGES } from "../../constants/tenants";
import InquirySection from "../inquiries/InquirySection";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { useCanWrite } from "../workspace/useCanWrite";
import EndTenancySheet from "./EndTenancySheet";
import ExpiredTenancyActions from "./ExpiredTenancyActions";
import { tenancyLine, tenancyStateLabel } from "./tenantDisplay";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import { writeOutcome } from "@platform/core/utils/writeOutcome";

export default function TenancySection({ applicant }: { applicant: ApplicantDetailResponse }) {
  const { colors, fontSize } = useTheme();
  const { showToast } = useToast();
  const canWrite = useCanWrite();
  const [endTenancy] = useEndTenancyMutation();
  const [restartTenancy, { isLoading: isRestarting }] = useRestartTenancyMutation();
  const [isEndOpen, setIsEndOpen] = useState(false);
  const isRestartingNow = useRef(false);

  const state = tenancyState(applicant);
  // The same list as the Leases section below, so it's one request.
  const { currentData: leases } = useGetSignedLeasesQuery({ applicant_id: applicant.id, limit: MOST_LEASES_ONE_PERSON_HAS }, { skip: state !== "expired" });
  const name = applicant.legal_name ?? TENANT_MESSAGES.unnamed;
  const line = tenancyLine(applicant);
  const reason = state === "active" ? null : applicant.tenant_ended_reason?.trim();
  const mutedText = { fontSize: fontSize.sm, color: colors.mutedForeground };

  async function end(chosenReason: string | null): Promise<string | null> {
    try {
      await endTenancy({ applicantId: applicant.id, data: { reason: chosenReason } }).unwrap();
      showToast(endedToast(name));
      return null;
    } catch (error) {
      if (isCancelledRequest(error)) return null;
      const status = httpStatus(error);
      if (status === 409) {
        showToast(TENANT_MESSAGES.changed, "error");
        return null;
      }
      // A lost answer can come after it ended (see writeOutcome); ending it again answers "changed".
      return writeOutcome(error) === "unknown" ? TENANT_MESSAGES.unsure : TENANT_MESSAGES.endFailed;
    }
  }

  async function restart(): Promise<void> {
    if (isRestartingNow.current) return;
    isRestartingNow.current = true;
    try {
      await restartTenancy(applicant.id).unwrap();
      showToast(restartedToast(name));
    } catch (error) {
      if (isCancelledRequest(error)) return;
      const status = httpStatus(error);
      const message = status === 409 ? TENANT_MESSAGES.changed : writeOutcome(error) === "unknown" ? TENANT_MESSAGES.unsure : TENANT_MESSAGES.restartFailed;
      showToast(message, "error");
    } finally {
      isRestartingNow.current = false;
    }
  }

  return (
    <InquirySection title={TENANT_MESSAGES.section}>
      <Chip label={tenancyStateLabel(state)} />
      {line ? <Text style={mutedText}>{line}</Text> : null}
      {reason ? <Text style={mutedText}>{reason}</Text> : null}
      {state === "expired" ? <Text style={mutedText}>{TENANT_MESSAGES.expiredBody}</Text> : null}
      {canWrite && state === "active" ? (
        <LoadingButton onPress={() => setIsEndOpen(true)} variant="secondary">
          {TENANT_MESSAGES.end}
        </LoadingButton>
      ) : null}
      {canWrite && state === "ended" ? (
        <LoadingButton isLoading={isRestarting} loadingText={TENANT_MESSAGES.restarting} onPress={() => void restart()} variant="secondary">
          {TENANT_MESSAGES.restart}
        </LoadingButton>
      ) : null}
      {/* Until the leases load there's no telling which way back fits; the Leases section offers a retry. */}
      {canWrite && state === "expired" && leases ? <ExpiredTenancyActions applicantId={applicant.id} leases={leases.items} tenantName={applicant.legal_name} /> : null}
      {canWrite ? <EndTenancySheet isOpen={isEndOpen} name={name} onClose={() => setIsEndOpen(false)} onEnd={end} /> : null}
    </InquirySection>
  );
}
