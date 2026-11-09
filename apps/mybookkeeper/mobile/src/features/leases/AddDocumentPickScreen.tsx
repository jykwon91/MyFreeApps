import { useGetLeaseTemplatesQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import { useGetSignedLeaseByIdQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WEB_BASE_URL } from "../../constants/api";
import { continueWithDocuments, LEASE_DOCUMENT_MESSAGES as MESSAGES } from "../../constants/leaseDocuments";
import { LEASE_TEMPLATE_LIST_LIMIT } from "../../constants/leaseTemplates";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { useOpenLink } from "../inquiries/useOpenLink";
import LeaseTemplatesSkeleton from "../leaseTemplates/LeaseTemplatesSkeleton";
import MoreOnWebsite from "../newLease/MoreOnWebsite";
import TemplatePickerRow from "../newLease/TemplatePickerRow";
import { useCanWrite } from "../workspace/useCanWrite";
import { addDocumentDetailsPath } from "./addDocumentFlow";

/** Which of the host's templates to make documents from, for a lease that already exists. */
export default function AddDocumentPickScreen({ leaseId }: { leaseId: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const canWrite = useCanWrite();
  const openLink = useOpenLink();
  const [picked, setPicked] = useState<string[]>([]);
  const lease = useGetSignedLeaseByIdQuery(leaseId);
  const templates = useGetLeaseTemplatesQuery({ limit: LEASE_TEMPLATE_LIST_LIMIT });
  const error = lease.error ?? templates.error;
  const { refresh, refreshControl } = useRefresh(() => Promise.all([lease.refetch(), templates.refetch()]), error);
  const rows = templates.currentData?.items ?? [];
  const onLease = new Set(lease.currentData?.templates.map((template) => template.id));

  if (!canWrite) return <EmptyState body={MESSAGES.viewOnly} heading={MESSAGES.pickTitle} />;
  if (httpStatus(lease.error) === 404) {
    return <EmptyState action={{ label: MESSAGES.goBack, onPress: () => router.back() }} body={MESSAGES.goneBody} heading={MESSAGES.goneHeading} />;
  }

  function toggle(id: string): void {
    setPicked((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]));
  }

  const isLoaded = Boolean(templates.currentData && lease.currentData);
  const emptyList = !isLoaded && !error ? (
    <LeaseTemplatesSkeleton />
  ) : !isLoaded ? (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoadTemplates} />
  ) : (
    <EmptyState
      action={{ label: MESSAGES.openWebsite, onPress: () => void openLink(`${WEB_BASE_URL}/lease-templates`) }}
      body={MESSAGES.noTemplatesBody}
      heading={MESSAGES.noTemplatesHeading}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={emptyList}
        ListFooterComponent={templates.currentData?.has_more ? <MoreOnWebsite path="/lease-templates" /> : undefined}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, padding: spacing.lg }}>
            {error && isLoaded ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
              {MESSAGES.pickTitle}
            </Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.pickBody}</Text>
          </View>
        }
        contentInsetAdjustmentBehavior="automatic"
        data={isLoaded ? rows : []}
        keyExtractor={(template) => template.id}
        refreshControl={refreshControl}
        renderItem={({ item }) => {
          const index = picked.indexOf(item.id);
          return <TemplatePickerRow note={onLease.has(item.id) ? MESSAGES.onThisLease : undefined} onPress={() => toggle(item.id)} position={index === -1 ? null : index + 1} template={item} />;
        }}
        style={{ flex: 1 }}
      />
      {picked.length > 0 ? (
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <LoadingButton onPress={() => router.push(addDocumentDetailsPath(leaseId, picked))}>{continueWithDocuments(picked.length)}</LoadingButton>
        </View>
      ) : null}
    </View>
  );
}
