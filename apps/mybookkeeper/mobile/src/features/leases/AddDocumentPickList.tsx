import { useGetLeaseTemplatesQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import { useGetSignedLeaseByIdQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { LEASE_DOCUMENTS_LOCKED_NOTE } from "@mybookkeeper/api-client/constants/leaseDocumentsLocked";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { Banner, EmptyState, LoadingButton, useOpenWebsite, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WEB_BASE_URL } from "../../constants/api";
import { continueWithDocuments, LEASE_DOCUMENT_MESSAGES as MESSAGES } from "../../constants/leaseDocuments";
import { LEASE_TEMPLATE_LIST_LIMIT } from "../../constants/leaseTemplates";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import LeaseTemplatesSkeleton from "../leaseTemplates/LeaseTemplatesSkeleton";
import MoreOnWebsite from "../newLease/MoreOnWebsite";
import TemplatePickerRow from "../newLease/TemplatePickerRow";
import { addDocumentDetailsPath } from "./addDocumentFlow";

/** Which of the host's templates to make documents from, for a lease that already exists. */
export default function AddDocumentPickList({ leaseId }: { leaseId: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const openWebsite = useOpenWebsite();
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const lease = useGetSignedLeaseByIdQuery(leaseId);
  const templates = useGetLeaseTemplatesQuery({ limit: LEASE_TEMPLATE_LIST_LIMIT });
  const error = lease.error ?? templates.error;
  const { refresh, refreshControl } = useRefresh(() => Promise.all([lease.refetch(), templates.refetch()]), error);
  const rows = templates.currentData?.items ?? [];
  const onLease = new Set(lease.currentData?.templates.map((template) => template.id));
  const isLocked = lease.currentData?.documents_locked ?? false;
  // A pick that the lease has since locked out is dropped, so it is never sent.
  const picked = pickedIds.filter((id) => !(isLocked && onLease.has(id)));

  if (httpStatus(lease.error) === 404) {
    return <EmptyState action={{ label: MESSAGES.goBack, onPress: () => router.back() }} body={MESSAGES.goneBody} heading={MESSAGES.goneHeading} />;
  }

  function toggle(id: string): void {
    setPickedIds(picked.includes(id) ? picked.filter((other) => other !== id) : [...picked, id]);
  }

  const isLoaded = Boolean(templates.currentData && lease.currentData);
  const emptyList = !isLoaded && !error ? (
    <LeaseTemplatesSkeleton />
  ) : !isLoaded ? (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoadTemplates} />
  ) : (
    <EmptyState
      action={{ label: MESSAGES.openWebsite, onPress: () => openWebsite(WEB_BASE_URL, "/lease-templates") }}
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
          const isBlocked = isLocked && onLease.has(item.id);
          const note = isBlocked ? LEASE_DOCUMENTS_LOCKED_NOTE : onLease.has(item.id) ? MESSAGES.onThisLease : undefined;
          return <TemplatePickerRow isDisabled={isBlocked} note={note} onPress={() => toggle(item.id)} position={index === -1 ? null : index + 1} template={item} />;
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
