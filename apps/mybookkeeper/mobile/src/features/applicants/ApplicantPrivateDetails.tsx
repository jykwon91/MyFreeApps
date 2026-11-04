import type { ApplicantDetailResponse } from "@mybookkeeper/api-client/types/applicant/applicant-detail-response";
import type { ApplicantSensitive } from "@mybookkeeper/api-client/types/applicant/applicant-sensitive";
import { Banner, LoadingButton, useAnnouncement, useTheme, useToast } from "@platform/mobile";
import { openBrowserAsync } from "expo-web-browser";
import { useState } from "react";
import { Text } from "react-native";
import { REVEAL_MESSAGES } from "../../constants/applicantReveal";
import InquiryContact from "../inquiries/InquiryContact";
import InquirySection from "../inquiries/InquirySection";
import { fullDateLabel } from "../../lib/localDate";
import TransactionFact from "../transactions/TransactionFact";
import { applicantName, screeningLine } from "./applicantDisplay";
import { useApplicantReveal } from "./useApplicantReveal";

function hasAnything(details: ApplicantSensitive): boolean {
  return Boolean(
    details.dob || details.vehicle_make_model || details.contact_email || details.contact_phone
    || details.references.length > 0
    || details.screening_reports.some((report) => report.adverse_action_snippet || report.presigned_url || !report.is_available),
  );
}

export default function ApplicantPrivateDetails({ applicant }: { applicant: ApplicantDetailResponse }) {
  const { colors, fontSize } = useTheme();
  const { showToast } = useToast();
  const { details, hide, isBusy, problem, show } = useApplicantReveal(applicant.id);
  const [hasShown, setHasShown] = useState(false);
  if (details && !hasShown) setHasShown(true);
  useAnnouncement(details ? REVEAL_MESSAGES.shownAnnouncement : hasShown ? REVEAL_MESSAGES.hiddenAnnouncement : undefined);
  const name = applicantName(applicant.legal_name);

  async function openReport(url: string): Promise<void> {
    try {
      await openBrowserAsync(url);
    } catch {
      showToast(REVEAL_MESSAGES.reportFailed, "error");
    }
  }

  if (!details) {
    return (
      <InquirySection title="Private details">
        {problem ? <Banner message={problem} /> : null}
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{REVEAL_MESSAGES.hint}</Text>
        <LoadingButton isLoading={isBusy} loadingText={REVEAL_MESSAGES.showing} onPress={() => void show()} variant="secondary">
          {REVEAL_MESSAGES.show}
        </LoadingButton>
      </InquirySection>
    );
  }

  return (
    <InquirySection title="Private details">
      {hasAnything(details) ? null : (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{REVEAL_MESSAGES.nothingOnFile}</Text>
      )}
      {details.dob ? <TransactionFact label="Date of birth" value={fullDateLabel(details.dob)} /> : null}
      {details.vehicle_make_model ? <TransactionFact label="Vehicle" value={details.vehicle_make_model} /> : null}
      {details.contact_email || details.contact_phone ? (
        <InquiryContact email={details.contact_email} name={name} phone={details.contact_phone} />
      ) : null}
      {details.references.map((row) => {
        // The page behind this can be older than the answer, so a name may not be there yet.
        const reference = applicant.references.find((candidate) => candidate.id === row.id);
        const label = reference ? `Reference, ${reference.reference_name}` : "Reference";
        return row.reference_contact ? <TransactionFact key={row.id} label={label} value={row.reference_contact} /> : null;
      })}
      {details.screening_reports.map((report) => {
        const result = applicant.screening_results.find((candidate) => candidate.id === report.id);
        const line = result ? screeningLine(result) : REVEAL_MESSAGES.screeningReport;
        return [
          report.adverse_action_snippet ? (
            <TransactionFact key={`${report.id}-reason`} label={`${line}, reason`} value={report.adverse_action_snippet} />
          ) : null,
          report.presigned_url ? (
            <LoadingButton
              accessibilityLabel={`${REVEAL_MESSAGES.openReport}, ${line}`}
              key={`${report.id}-report`}
              onPress={() => void openReport(report.presigned_url ?? "")}
              variant="ghost"
            >
              {REVEAL_MESSAGES.openReport}
            </LoadingButton>
          ) : null,
          report.is_available ? null : (
            <Text key={`${report.id}-missing`} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{REVEAL_MESSAGES.reportMissing}</Text>
          ),
        ];
      })}
      <LoadingButton onPress={hide} variant="secondary">
        {REVEAL_MESSAGES.hide}
      </LoadingButton>
    </InquirySection>
  );
}
