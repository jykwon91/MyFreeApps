import { useGetSignedLeaseByIdQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { LeaseAttachmentKind } from "@mybookkeeper/api-client/types/lease/lease-attachment-kind";
import type { SignedLeaseAttachment } from "@mybookkeeper/api-client/types/lease/signed-lease-attachment";
import { formatLongDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import { Banner, EmptyState, LoadingButton, MIN_TOUCH_TARGET, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { extendedLine, LEASE_MESSAGES } from "../../constants/leases";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import InquiryChip from "../inquiries/InquiryChip";
import InquirySection from "../inquiries/InquirySection";
import { useOpenLink } from "../inquiries/useOpenLink";
import { httpStatus } from "../transactions/transactionMessages";
import { useCanWrite } from "../workspace/useCanWrite";
import { leaseCountdown, leaseIsInEffect, leaseStatusLabel, leaseTerm, sortLeaseFiles } from "./leaseDisplay";
import LeaseDetailSkeleton from "./LeaseDetailSkeleton";
import ExtendLeaseSheet from "./ExtendLeaseSheet";
import LeaseFileRow from "./LeaseFileRow";
import LeaseStatusControl from "./LeaseStatusControl";
import LeaseUploadSheet from "./LeaseUploadSheet";
import UndoExtensionButton from "./UndoExtensionButton";
import { useOpenLeaseFile } from "./useOpenLeaseFile";

export default function LeaseDetailScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const openLink = useOpenLink();
  const { currentData: lease, error, isLoading, refetch } = useGetSignedLeaseByIdQuery(id);
  const { openingId, open } = useOpenLeaseFile(id);
  const { refresh, refreshControl } = useRefresh(refetch, error);
  const [uploadingKind, setUploadingKind] = useState<LeaseAttachmentKind | null | undefined>(undefined);
  const [isExtending, setIsExtending] = useState(false);

  if (isLoading) return <LeaseDetailSkeleton />;
  if (!lease) {
    return httpStatus(error) === 404 ? (
      <EmptyState action={{ label: LEASE_MESSAGES.goBack, onPress: () => router.back() }} body={LEASE_MESSAGES.goneBody} heading={LEASE_MESSAGES.goneHeading} />
    ) : (
      <EmptyState action={{ label: LEASE_MESSAGES.tryAgain, onPress: refresh }} body={LEASE_MESSAGES.checkConnection} heading={LEASE_MESSAGES.couldntLoadOne} />
    );
  }

  const name = lease.applicant_legal_name ?? LEASE_MESSAGES.unnamedTenant;
  const countdown = leaseCountdown(lease.status, lease.ends_on);
  const { signedCopy, others } = sortLeaseFiles(lease.attachments);
  const mutedText = { fontSize: fontSize.sm, color: colors.mutedForeground };
  const extension = lease.latest_extension;
  const fileRow = (file: SignedLeaseAttachment) => (
    <LeaseFileRow file={file} isDisabled={openingId !== null} isOpening={openingId === file.id} key={file.id} onOpen={() => void open(file)} />
  );

  return (
    <>
      <ScrollView
        contentContainerStyle={{ gap: spacing.xl, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={refreshControl}
        style={{ flex: 1 }}
        testID="lease-detail"
      >
        {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
        <View style={{ gap: spacing.sm, alignItems: "flex-start" }}>
          <Pressable
            accessibilityHint="Opens their page"
            accessibilityRole="button"
            onPress={() => router.push(`/applicants/${lease.applicant_id}`)}
            style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
          >
            <Text style={{ fontSize: fontSize.xl, fontWeight: "700", color: colors.primary }}>
              {name}
            </Text>
          </Pressable>
          <InquiryChip label={leaseStatusLabel(lease.status)} />
          {canWrite ? <LeaseStatusControl leaseId={lease.id} status={lease.status} /> : null}
        </View>
  
        <InquirySection title={LEASE_MESSAGES.term}>
          <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{leaseTerm(lease.starts_on, lease.ends_on)}</Text>
          {countdown ? <Text style={mutedText}>{countdown}</Text> : null}
          {extension ? <Text style={mutedText}>{extendedLine(formatLongDate(extension.ends_on), formatLongDate(extension.created_at))}</Text> : null}
          {canWrite && leaseIsInEffect(lease.status) && lease.ends_on ? (
            <LoadingButton onPress={() => setIsExtending(true)} variant="secondary">
              {LEASE_MESSAGES.extend}
            </LoadingButton>
          ) : null}
          {canWrite && leaseIsInEffect(lease.status) && extension?.can_undo ? <UndoExtensionButton extension={extension} leaseId={lease.id} /> : null}
        </InquirySection>
  
        <InquirySection title={LEASE_MESSAGES.signedCopy}>
          {signedCopy ? fileRow(signedCopy) : <Text style={mutedText}>{LEASE_MESSAGES.noSignedCopy}</Text>}
          {!signedCopy && canWrite ? (
            <LoadingButton onPress={() => setUploadingKind("signed_lease")} variant="secondary">
              {LEASE_MESSAGES.addSignedCopy}
            </LoadingButton>
          ) : null}
        </InquirySection>
  
        {others.length > 0 || canWrite ? (
          <InquirySection title={LEASE_MESSAGES.otherFiles}>
            {others.map(fileRow)}
            {canWrite ? (
              <LoadingButton onPress={() => setUploadingKind(null)} variant="secondary">
                {LEASE_MESSAGES.addFile}
              </LoadingButton>
            ) : null}
          </InquirySection>
        ) : null}
  
        {lease.notes?.trim() ? (
          <InquirySection title={LEASE_MESSAGES.notes}>
            <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{lease.notes.trim()}</Text>
          </InquirySection>
        ) : null}
  
        {lease.parent_lease_id ? (
          <LoadingButton onPress={() => router.push(`/leases/${lease.parent_lease_id}`)} variant="ghost">
            {LEASE_MESSAGES.earlierLease}
          </LoadingButton>
        ) : null}
        {lease.successor_lease_id ? (
          <LoadingButton onPress={() => router.push(`/leases/${lease.successor_lease_id}`)} variant="ghost">
            {LEASE_MESSAGES.newerLease}
          </LoadingButton>
        ) : null}
        {canWrite ? (
          <LoadingButton accessibilityHint="Opens your browser" onPress={() => void openLink(`${WEB_BASE_URL}/leases/${lease.id}`)} variant="secondary">
            {LEASE_MESSAGES.manageOnWebsite}
          </LoadingButton>
        ) : null}
      </ScrollView>
      {isExtending && lease.ends_on ? <ExtendLeaseSheet endsOn={lease.ends_on} leaseId={lease.id} onClose={() => setIsExtending(false)} /> : null}
      {uploadingKind !== undefined ? <LeaseUploadSheet initialKind={uploadingKind} leaseId={lease.id} onClose={() => setUploadingKind(undefined)} /> : null}
    </>
  );
}
