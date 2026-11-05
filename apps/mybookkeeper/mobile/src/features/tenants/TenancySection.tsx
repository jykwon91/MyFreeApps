import { useEndTenancyMutation, useRestartTenancyMutation } from "@mybookkeeper/api-client/store/applicantsApi";
import type { ApplicantDetailResponse } from "@mybookkeeper/api-client/types/applicant/applicant-detail-response";
import { tenancyState } from "@mybookkeeper/api-client/utils/tenancyState";
import { LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Text } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { endedToast, restartedToast, TENANT_MESSAGES } from "../../constants/tenants";
import InquiryChip from "../inquiries/InquiryChip";
import InquirySection from "../inquiries/InquirySection";
import { useOpenLink } from "../inquiries/useOpenLink";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { useCanWrite } from "../workspace/useCanWrite";
import EndTenancySheet from "./EndTenancySheet";
import { tenancyLine, tenancyStateLabel } from "./tenantDisplay";

export default function TenancySection({ applicant }: { applicant: ApplicantDetailResponse }) {
  const { colors, fontSize } = useTheme();
  const { showToast } = useToast();
  const canWrite = useCanWrite();
  const openLink = useOpenLink();
  const [endTenancy] = useEndTenancyMutation();
  const [restartTenancy, { isLoading: isRestarting }] = useRestartTenancyMutation();
  const [isEndOpen, setIsEndOpen] = useState(false);
  const isRestartingNow = useRef(false);

  const state = tenancyState(applicant);
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
      const status = httpStatus(error);
      if (status === 409) {
        showToast(TENANT_MESSAGES.changed, "error");
        return null;
      }
      return status === undefined ? TENANT_MESSAGES.noConnection : TENANT_MESSAGES.endFailed;
    }
  }

  async function restart(): Promise<void> {
    if (isRestartingNow.current) return;
    isRestartingNow.current = true;
    try {
      await restartTenancy(applicant.id).unwrap();
      showToast(restartedToast(name));
    } catch (error) {
      const status = httpStatus(error);
      const message = status === 409 ? TENANT_MESSAGES.changed : status === undefined ? TENANT_MESSAGES.noConnection : TENANT_MESSAGES.restartFailed;
      showToast(message, "error");
    } finally {
      isRestartingNow.current = false;
    }
  }

  return (
    <InquirySection title={TENANT_MESSAGES.section}>
      <InquiryChip label={tenancyStateLabel(state)} />
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
      {canWrite && state === "expired" ? (
        <LoadingButton onPress={() => void openLink(`${WEB_BASE_URL}/tenants/${applicant.id}`)} variant="secondary">
          {TENANT_MESSAGES.openLeases}
        </LoadingButton>
      ) : null}
      {canWrite ? <EndTenancySheet isOpen={isEndOpen} name={name} onClose={() => setIsEndOpen(false)} onEnd={end} /> : null}
    </InquirySection>
  );
}
