import { useGetInquiryByIdQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { INQUIRY_SOURCE_LABELS } from "@mybookkeeper/api-client/constants/inquiryLabels";
import type { InquiryStage } from "@mybookkeeper/api-client/types/inquiry/inquiry-stage";
import { Banner, Chip, EmptyState, LoadingButton, OptionSheet, SHOWING_LAST_LOADED_MESSAGE, Skeleton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { InquiryMoreAction } from "../../types/InquiryMoreAction";
import TransactionFact from "../transactions/TransactionFact";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { useCanWrite } from "../workspace/useCanWrite";
import { deleteReplyDraft } from "./replyDrafts";
import { moreOptions, stageOptions } from "./inquiryActionOptions";
import InquiryContact from "./InquiryContact";
import { inquirerName, receivedAgo, stageLabel, stayDates } from "./inquiryDisplay";
import InquiryExtras from "./InquiryExtras";
import InquiryListingRow from "./InquiryListingRow";
import InquiryMessages from "./InquiryMessages";
import InquiryNotes from "./InquiryNotes";
import InquirySection from "./InquirySection";
import { useInquiryActions } from "./useInquiryActions";
import { useHasReplyDraft } from "./useHasReplyDraft";

export default function InquiryDetailScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const canWrite = useCanWrite();
  const { currentData: inquiry, error, isFetching, refetch } = useGetInquiryByIdQuery(id);
  const actions = useInquiryActions(id);
  const [openSheet, setOpenSheet] = useState<"stage" | "more" | null>(null);
  const { refresh, refreshControl } = useRefresh(refetch, error);
  const hasDraft = useHasReplyDraft(id);
  // iOS drops an Alert raised while a sheet is still closing, so More's choice waits for it to go.
  const chosenAction = useRef<InquiryMoreAction | null>(null);
  const isGone = httpStatus(error) === 404;

  useEffect(() => {
    if (actions.hasArchived) {
      deleteReplyDraft(id);
      router.back();
    }
  }, [actions.hasArchived, id]);

  if (actions.hasArchived) return <View style={{ flex: 1 }} />;
  if (!isGone && !inquiry && (isFetching || !error)) {
    return (
      <View accessibilityLabel="Loading this inquiry" style={{ gap: spacing.md, padding: spacing.lg }}>
        <Skeleton height={28} width="60%" />
        <Skeleton height={16} width="40%" />
        <Skeleton height={160} />
        <Skeleton height={80} />
      </View>
    );
  }
  if (isGone || !inquiry) {
    return (
      <EmptyState
        action={isGone ? { label: "Back", onPress: () => router.back() } : { label: "Try again", onPress: refresh }}
        body={isGone ? "It may have been archived." : "Want me to try again?"}
        heading={isGone ? "I can't find that inquiry." : "I couldn't load that inquiry."}
      />
    );
  }

  const name = inquirerName(inquiry.inquirer_name);
  const isFlagged = inquiry.spam_status === "flagged";
  const isSpam = inquiry.spam_status === "spam";
  function runChosenAction(): void {
    const action = chosenAction.current;
    chosenAction.current = null;
    if (action === "promote") router.push(`/inquiries/${id}/promote`);
    if (action === "spam") void actions.markSpam();
    if (action === "notSpam") void actions.markNotSpam();
    if (action === "decline") actions.confirmDecline();
    if (action === "archive") actions.confirmArchive();
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
        {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
        <View style={{ gap: spacing.xs }}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {name}
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
            {`${INQUIRY_SOURCE_LABELS[inquiry.source]} · Received ${receivedAgo(inquiry.received_at)}`}
          </Text>
          <Chip label={stageLabel(inquiry.stage)} />
        </View>

        {isFlagged || isSpam ? (
          <Banner
            actions={
              canWrite
                ? [
                    { label: "Not spam", onPress: () => void actions.markNotSpam() },
                    ...(isFlagged ? [{ label: "Mark as spam", onPress: () => void actions.markSpam() }] : []),
                  ]
                : undefined
            }
            message={isFlagged ? "I flagged this as possible spam." : "This is marked as spam."}
          />
        ) : null}

        <InquirySection title="Messages">
          <InquiryMessages messages={inquiry.messages} name={inquiry.inquirer_name} />
        </InquirySection>

        <InquirySection title="Stay">
          <TransactionFact label="Dates" value={stayDates(inquiry.desired_start_date, inquiry.desired_end_date)} />
          {inquiry.inquirer_employer?.trim() ? <TransactionFact label="Employer" value={inquiry.inquirer_employer.trim()} /> : null}
          <InquiryListingRow listingId={inquiry.listing_id} />
        </InquirySection>

        <InquirySection title="Contact">
          <InquiryContact email={inquiry.inquirer_email} name={name} phone={inquiry.inquirer_phone} />
        </InquirySection>

        <InquiryNotes canWrite={canWrite} id={id} notes={inquiry.notes} />
        <InquiryExtras inquiry={inquiry} />

        {inquiry.linked_applicant_id ? (
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>Promoted to an applicant</Text>
            <LoadingButton onPress={() => router.push(`/applicants/${inquiry.linked_applicant_id}`)} variant="ghost">
              Open applicant
            </LoadingButton>
          </View>
        ) : null}
        {canWrite ? null : <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>You have view-only access.</Text>}
      </ScrollView>

      {canWrite ? (
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
          <LoadingButton disabled={actions.isBusy} onPress={() => router.push(`/inquiries/${id}/reply`)} style={{ flex: 2 }}>
            {hasDraft ? "Continue draft" : "Reply"}
          </LoadingButton>
          <LoadingButton
            accessibilityLabel={`Stage: ${stageLabel(inquiry.stage)}`}
            disabled={actions.isBusy}
            isLoading={actions.isUpdating}
            loadingText="Moving…"
            onPress={() => setOpenSheet("stage")}
            style={{ flex: 2 }}
            variant="secondary"
          >
            {stageLabel(inquiry.stage)}
          </LoadingButton>
          <LoadingButton disabled={actions.isBusy} onPress={() => setOpenSheet("more")} style={{ flex: 1 }} variant="secondary">
            More
          </LoadingButton>
        </View>
      ) : null}

      <OptionSheet
        isOpen={openSheet === "stage"}
        onClose={() => setOpenSheet(null)}
        onSelect={(stage) => {
          setOpenSheet(null);
          if (stage !== inquiry.stage) void actions.moveToStage(stage as InquiryStage);
        }}
        options={stageOptions(inquiry)}
        title="Move to which stage?"
        value={inquiry.stage}
      />
      <OptionSheet
        isOpen={openSheet === "more"}
        onClose={() => setOpenSheet(null)}
        onClosed={runChosenAction}
        onSelect={(action) => {
          chosenAction.current = action;
          setOpenSheet(null);
        }}
        options={moreOptions(inquiry)}
        title="More"
        value={null}
      />
    </View>
  );
}
