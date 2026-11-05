import { signedLeasesApi } from "@mybookkeeper/api-client/store/signedLeasesApi";
import rentRemindersApi from "@mybookkeeper/api-client/store/rentRemindersApi";
import { transactionsApi } from "@mybookkeeper/api-client/store/transactionsApi";
import { useGetApplicantByIdQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";
import { getAllowedTransitions } from "@mybookkeeper/api-client/utils/applicantStageTransitions";
import { Banner, EmptyState, LoadingButton, OptionSheet, Skeleton, useRefresh, useTheme, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CONTRACT_LOCKED_STAGE, STAGES_READY_FOR_LEASE } from "../../constants/applicants";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import TenantLeases from "../leases/TenantLeases";
import TenantRent from "../rent/TenantRent";
import TenantRentReminders from "../rent/TenantRentReminders";
import TenantPayments from "./TenantPayments";
import TenancySection from "../tenants/TenancySection";
import InquiryChip from "../inquiries/InquiryChip";
import InquirySection from "../inquiries/InquirySection";
import TransactionFact from "../transactions/TransactionFact";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { templatesPath } from "../newLease/newLeaseFlow";
import { useCanWrite } from "../workspace/useCanWrite";
import { applicantName, applicantStageLabel, contractDates, promotedAgo, smokerLabel } from "./applicantDisplay";
import ApplicantHistory from "./ApplicantHistory";
import ApplicantPrivateDetails from "./ApplicantPrivateDetails";
import ApplicantScreening from "./ApplicantScreening";
import ApplicantStageSheet from "./ApplicantStageSheet";
import ContractStartSheet from "./ContractStartSheet";
import { useMoveApplicantStage } from "./useMoveApplicantStage";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../../lib/store";

export default function ApplicantDetailScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const { currentData: applicant, error, isFetching, refetch } = useGetApplicantByIdQuery(id);
  const dispatch = useDispatch<AppDispatch>();
  // Its leases and payments are their own queries, and a pull should reload the whole page.
  const reloadPage = () => {
    dispatch(signedLeasesApi.util.invalidateTags([{ type: "SignedLease", id: "LIST" }]));
    dispatch(transactionsApi.util.invalidateTags([{ type: "Transaction", id: "LIST" }]));
    dispatch(rentRemindersApi.util.invalidateTags([{ type: "RentReminder", id }]));
    return refetch();
  };
  const { refresh, refreshControl } = useRefresh(reloadPage, error);
  const isGone = httpStatus(error) === 404;
  const insets = useSafeAreaInsets();
  const canWrite = useCanWrite();
  const { showToast } = useToast();
  const move = useMoveApplicantStage(id, refetch);
  const [openSheet, setOpenSheet] = useState<"stage" | "contract" | null>(null);
  // Outlives the note sheet closing, so it doesn't slide away empty.
  const [noteForStage, setNoteForStage] = useState<ApplicantStage | null>(null);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  // iOS can't raise one sheet while another is still closing, so the note waits for the list to go.
  const chosenStage = useRef<ApplicantStage | null>(null);

  if (!isGone && !applicant && (isFetching || !error)) {
    return (
      <View accessibilityLabel="Loading this applicant" style={{ gap: spacing.md, padding: spacing.lg }}>
        <Skeleton height={28} width="60%" />
        <Skeleton height={16} width="40%" />
        <Skeleton height={80} />
        <Skeleton height={160} />
      </View>
    );
  }
  if (isGone || !applicant) {
    return (
      <EmptyState
        action={isGone ? { label: "Back", onPress: () => router.back() } : { label: "Try again", onPress: refresh }}
        body={isGone ? "They may have been removed." : "Want me to try again?"}
        heading={isGone ? "I can't find that applicant." : "I couldn't load that applicant."}
      />
    );
  }

  const dates = contractDates(applicant.contract_start, applicant.contract_end);
  const moves = getAllowedTransitions(applicant.stage);
  const isContractLocked = applicant.stage === CONTRACT_LOCKED_STAGE;
  const isReadyForLease = STAGES_READY_FOR_LEASE.includes(applicant.stage);
  const isTenant = applicant.stage === CONTRACT_LOCKED_STAGE;

  async function moveAndConfirm(stage: ApplicantStage, note: string): Promise<string | null> {
    const problem = await move(stage, note);
    if (!problem) showToast(`Moved to ${applicantStageLabel(stage)}.`);
    return problem;
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl} testID="applicant-detail">
        {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
        <View style={{ gap: spacing.xs }}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {applicantName(applicant.legal_name)}
          </Text>
          {isTenant ? null : <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`Promoted ${promotedAgo(applicant.created_at)}`}</Text>}
          {isTenant ? null : <InquiryChip label={applicantStageLabel(applicant.stage)} />}
        </View>

        {isTenant ? <TenancySection applicant={applicant} /> : null}

        {applicant.inquiry_id ? (
          <LoadingButton onPress={() => router.push(`/inquiries/${applicant.inquiry_id}`)} variant="secondary">
            See the original inquiry
          </LoadingButton>
        ) : null}

        <InquirySection title="Details">
          {applicant.employer_or_hospital?.trim() ? <TransactionFact label="Employer" value={applicant.employer_or_hospital.trim()} /> : null}
          {dates ? <TransactionFact label="Contract" value={dates} /> : null}
          {canWrite && !isContractLocked ? (
            <LoadingButton onPress={() => setOpenSheet("contract")} variant="ghost">
              {applicant.contract_start ? "Change contract start" : "Add contract start"}
            </LoadingButton>
          ) : null}
          {isContractLocked ? (
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>The start date is locked because the lease is signed.</Text>
          ) : null}
          <TransactionFact label="Smoker" value={smokerLabel(applicant.smoker)} />
          {applicant.pets?.trim() ? <TransactionFact label="Pets" value={applicant.pets.trim()} /> : null}
          {applicant.referred_by?.trim() ? <TransactionFact label="Referred by" value={applicant.referred_by.trim()} /> : null}
        </InquirySection>

        <TenantLeases applicantId={applicant.id} isTenant={isTenant} name={applicant.legal_name ?? "them"} />

        {isTenant ? <TenantRent applicantId={applicant.id} key={`rent-${applicant.id}`} /> : null}

        {isTenant ? <TenantRentReminders applicantId={applicant.id} hasEnded={applicant.tenant_ended_at !== null} key={`reminders-${applicant.id}`} name={applicant.legal_name} /> : null}

        {isTenant ? <TenantPayments applicantId={applicant.id} key={`payments-${applicant.id}`} name={applicant.legal_name ?? "them"} /> : null}

        {isTenant ? null : <ApplicantScreening applicant={applicant} />}

        <ApplicantPrivateDetails applicant={applicant} key={applicant.id} />

        {isTenant ? <ApplicantScreening applicant={applicant} /> : null}

        <ApplicantHistory applicant={applicant} />
        {canWrite ? null : <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>You have view-only access.</Text>}
      </ScrollView>

      {canWrite && moves.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          {isReadyForLease ? (
            <LoadingButton onPress={() => router.push(templatesPath({ applicantId: id }))} style={{ flex: 1 }}>
              Generate lease
            </LoadingButton>
          ) : null}
          <LoadingButton
            accessibilityHint="Choose where to move them"
            onPress={() => setOpenSheet("stage")}
            style={{ flex: 1 }}
            variant={isReadyForLease ? "secondary" : "primary"}
          >
            {`Stage: ${applicantStageLabel(applicant.stage)}`}
          </LoadingButton>
        </View>
      ) : null}

      <OptionSheet
        isOpen={openSheet === "stage"}
        onClose={() => setOpenSheet(null)}
        onClosed={() => {
          if (!chosenStage.current) return;
          setNoteForStage(chosenStage.current);
          setIsNoteOpen(true);
          chosenStage.current = null;
        }}
        onSelect={(stage) => {
          chosenStage.current = stage;
          setOpenSheet(null);
        }}
        options={moves.map((stage) => ({ value: stage, label: applicantStageLabel(stage) }))}
        title="Move to which stage?"
        value={null}
      />
      <ApplicantStageSheet
        isOpen={isNoteOpen}
        name={applicantName(applicant.legal_name)}
        onClose={() => setIsNoteOpen(false)}
        onMove={moveAndConfirm}
        stage={noteForStage}
      />
      <ContractStartSheet applicantId={id} isOpen={openSheet === "contract"} onClose={() => setOpenSheet(null)} value={applicant.contract_start} />
    </View>
  );
}
