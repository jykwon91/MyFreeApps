import { useGetLeaseTemplateByIdQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { LEASE_TEMPLATE_MESSAGES as MESSAGES } from "../../constants/leaseTemplates";
import { NEW_LEASE_MESSAGES } from "../../constants/newLease";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { useOpenLink } from "../inquiries/useOpenLink";
import { nextPath } from "../newLease/newLeaseFlow";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { useCanWrite } from "../workspace/useCanWrite";
import { inDisplayOrder, placeholdersLine } from "./leaseTemplateDisplay";
import LeaseTemplateDetailSkeleton from "./LeaseTemplateDetailSkeleton";
import LeaseTemplateFileRow from "./LeaseTemplateFileRow";
import { useOpenTemplateFile } from "./useOpenTemplateFile";

export default function LeaseTemplateDetailScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const canWrite = useCanWrite();
  const { openingId, open } = useOpenTemplateFile(id);
  const { currentData: template, error, isFetching, refetch } = useGetLeaseTemplateByIdQuery(id);
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  if (!template && (isFetching || !error)) return <LeaseTemplateDetailSkeleton />;
  // A template deleted on the website has files that won't open, so the copy in memory can't be offered.
  const isGone = httpStatus(error) === 404;
  if (!template || isGone) {
    return (
      <EmptyState
        action={isGone ? { label: MESSAGES.back, onPress: () => router.back() } : { label: MESSAGES.tryAgain, onPress: refresh }}
        body={isGone ? MESSAGES.maybeDeleted : MESSAGES.tryAgainOffer}
        heading={isGone ? MESSAGES.cantFind : MESSAGES.couldntLoadOne}
      />
    );
  }

  const sectionHeading = { fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground } as const;

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.xl, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl} testID="lease-template-detail">
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {template.name}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`Version ${template.version}`}</Text>
      </View>
      {canWrite ? <LoadingButton onPress={() => router.push(nextPath({ templateIds: [template.id] }))}>{NEW_LEASE_MESSAGES.useTemplate}</LoadingButton> : null}
      {template.description ? (
        <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {template.description}
        </Text>
      ) : null}
      <View style={{ gap: spacing.md }}>
        <Text accessibilityRole="header" style={sectionHeading}>
          {MESSAGES.files}
        </Text>
        {template.files.length === 0 ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.noFiles}</Text> : null}
        {inDisplayOrder(template.files).map((file) => (
          <LeaseTemplateFileRow
            file={file}
            isDisabled={openingId !== null}
            isOpening={openingId === file.id}
            key={file.id}
            onOpen={() => void open(file)}
          />
        ))}
      </View>
      <View style={{ gap: spacing.sm }}>
        <Text accessibilityRole="header" style={sectionHeading}>
          {MESSAGES.placeholders}
        </Text>
        <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{placeholdersLine(template.placeholders.length)}</Text>
      </View>
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.manageOnWebsite}</Text>
        <LoadingButton
          accessibilityLabel={MESSAGES.openOneOnWebsite}
          onPress={() => void openLink(`${WEB_BASE_URL}/lease-templates/${template.id}`)}
          variant="ghost"
        >
          {MESSAGES.openWebsite}
        </LoadingButton>
      </View>
    </ScrollView>
  );
}
